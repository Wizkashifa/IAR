"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cardStore, ConflictError, vendorId } from "@/lib/cards";
import { requireViewer, type Viewer } from "@/lib/viewer";
import { deliver } from "@/lib/notifications";
import { actorFor } from "@/lib/people";
import { purchaseNotices } from "@/lib/purchases/notices";
import { checkFiles, filesFrom, saveAttachments } from "@/lib/purchases/drive";
import { parsePurchaseInput, type PurchaseInput } from "@/lib/purchases/input";
import { FUNDS } from "@/lib/purchases/accounts";
import { type PurchaseContext, cardsHeldBy, personFunds, purchaseContext } from "@/lib/purchases/settings";
import { requestableFunds } from "@/lib/teams";
import * as wf from "@/lib/purchases/workflow";

export type FormState = { errors: string[] };

const nowIso = () => new Date().toISOString();
const directorsFor = (ctx: PurchaseContext, c: wf.PurchaseCard) => {
  const a = ctx.routing.approversFor(c.purchase.fund);
  return { directors: a.directors, chairs: a.chairs };
};

/** Funds this person may charge: their teams' and the ones they direct; office and finance any. */
export async function fundsFor(viewer: Viewer, ctx: PurchaseContext): Promise<string[]> {
  return requestableFunds(personFunds(ctx, viewer.email).request, viewer.actingRoles, FUNDS);
}

async function parseForm(viewer: Viewer, form: FormData, ctx: PurchaseContext, keepFund?: string) {
  let raw: PurchaseInput;
  try {
    raw = JSON.parse(String(form.get("payload") ?? "{}")) as PurchaseInput;
  } catch {
    return { ok: false as const, errors: ["The form couldn't be read. Reload the page and try again."] };
  }
  const store = await cardStore();
  const vendors = await store.listVendors();
  const parsed = parsePurchaseInput(raw, {
    requesterName: viewer.name,
    cards: cardsHeldBy(ctx, viewer.email).map((c) => ({ last4: c.last4, fund: c.fund })),
    vendors,
    // Editing a returned request may keep its fund even if the person has since left that committee.
    funds: [...(await fundsFor(viewer, ctx)), ...(keepFund ? [keepFund] : [])],
  });
  const files = filesFrom(form, "attachments");
  const fileErrors = checkFiles(files);
  if (!parsed.ok || fileErrors.length) return { ok: false as const, errors: [...(parsed.ok ? [] : parsed.errors), ...fileErrors] };
  return { ok: true as const, details: parsed.details, files };
}

export async function createPurchase(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const ctx = await purchaseContext();
  const r = await parseForm(viewer, form, ctx);
  if (!r.ok) return { errors: r.errors };

  const store = await cardStore();
  const now = nowIso();
  const routed = wf.submit(wf.newPurchase(r.details, viewer.email, now), actor, ctx.routing, now);
  const { id: _blank, ...toCreate } = routed;
  const created = (await store.create(toCreate, "PO")) as wf.PurchaseCard;
  await deliver(purchaseNotices(null, created, actor, directorsFor(ctx, created)), actor.email);

  if (r.files.length) {
    try {
      const attachments = await saveAttachments(created.id, created.purchase.fund, r.files);
      const withFiles: wf.PurchaseCard = {
        ...created,
        purchase: { ...created.purchase, attachments, history: [...created.purchase.history, { at: nowIso(), by: actor.email, action: `Attached ${attachments.length} file${attachments.length === 1 ? "" : "s"}` }] },
        updatedAt: nowIso(),
      };
      await store.save(withFiles, created.updatedAt);
    } catch (err) {
      console.error("attachment upload failed", err);
      redirect(`/purchases/${created.id}?error=${encodeURIComponent("Your request was submitted, but the files didn't upload. Send them to the finance office with the request number.")}`);
    }
  }
  revalidatePath("/purchases");
  redirect(`/purchases/${created.id}?ok=submitted`);
}

export async function resubmitPurchase(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const store = await cardStore();
  const card = await store.get(id);
  if (!wf.isPurchaseCard(card)) return { errors: ["That request no longer exists."] };
  const allowed = wf.permission(card, actor, "resubmit");
  if (!allowed.ok) return { errors: [allowed.reason] };

  const ctx = await purchaseContext();
  const r = await parseForm(viewer, form, ctx, card.purchase.fund);
  if (!r.ok) return { errors: r.errors };
  const now = nowIso();
  let attachments = card.purchase.attachments;
  try {
    attachments = [...attachments, ...(await saveAttachments(card.id, r.details.fund, r.files))];
  } catch (err) {
    console.error("attachment upload failed", err);
    return { errors: ["The files didn't upload. Try again, or send them to the finance office."] };
  }
  const edited = {
    ...card.purchase,
    ...r.details,
    attestation: { name: r.details.attestation.name, at: now },
    attachments,
  };
  try {
    const next = wf.resubmit(card, edited, actor, ctx.routing, now);
    await store.save(next, card.updatedAt);
    await deliver(purchaseNotices(card, next, actor, directorsFor(ctx, next)), actor.email);
  } catch (err) {
    return { errors: [err instanceof ConflictError || err instanceof wf.WorkflowError ? err.message : "Something went wrong saving the request."] };
  }
  revalidatePath("/purchases");
  redirect(`/purchases/${id}?ok=resubmitted`);
}

/** Approve, return, reject, pay, book, resolve a refund/repayment, or cancel. */
export async function actOnPurchase(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const id = String(form.get("id") ?? "");
  const action = String(form.get("action") ?? "") as wf.Action;
  const note = String(form.get("note") ?? "").slice(0, 1000);
  const store = await cardStore();
  const card = await store.get(id);
  if (!wf.isPurchaseCard(card)) redirect("/purchases");
  if (String(form.get("expected") ?? "") !== card.updatedAt) {
    redirect(`/purchases/${id}?error=${encodeURIComponent("This request changed while you were looking at it. Check it again before acting.")}`);
  }

  const ctx = await purchaseContext();
  const s = ctx.routing;
  const now = nowIso();
  let error: string | null = null;
  let ok = action as string;
  try {
    let next: wf.PurchaseCard;
    switch (action) {
      case "approve": {
        const w9Received = form.get("w9Received") === "on";
        next = wf.approve(card, actor, s, now, { note: note || undefined, w9Received });
        if (w9Received && card.purchase.payee) {
          await store.saveVendor({ id: vendorId(card.purchase.payee), name: card.purchase.payee, w9OnFile: true, w9Date: now });
        }
        break;
      }
      case "return":
        next = wf.returnForChanges(card, actor, now, note);
        break;
      case "reject":
        next = wf.reject(card, actor, now, note);
        break;
      case "pay":
        next = wf.recordPayment(card, actor, now, String(form.get("method") ?? ""), String(form.get("reference") ?? ""));
        break;
      case "books":
        next = wf.recordBooks(card, actor, now);
        break;
      case "resolve":
        next = wf.resolveLine(card, actor, now, String(form.get("line") ?? ""));
        break;
      case "cancel":
        next = wf.cancel(card, actor, now);
        break;
      default:
        throw new wf.WorkflowError("Unknown action.");
    }
    await store.save(next, card.updatedAt);
    await deliver(purchaseNotices(card, next, actor, directorsFor(ctx, next)), actor.email);
    // Paying a vendor for the first time puts them in the registry.
    if (action === "pay" && card.purchase.kind === "pay" && card.purchase.payee) {
      const vid = vendorId(card.purchase.payee);
      const known = (await store.listVendors()).find((v) => v.id === vid);
      if (!known) await store.saveVendor({ id: vid, name: card.purchase.payee, w9OnFile: false });
    }
  } catch (err) {
    if (err instanceof wf.WorkflowError || err instanceof ConflictError) error = err.message;
    else {
      console.error("purchase action failed", err);
      error = "Something went wrong. Nothing was changed.";
    }
    ok = "";
  }
  revalidatePath("/purchases");
  revalidatePath(`/purchases/${id}`);
  redirect(error ? `/purchases/${id}?error=${encodeURIComponent(error)}` : `/purchases/${id}?ok=${ok}`);
}

/** For forms with several submit buttons: each button binds its own action. */
export async function actOnPurchaseWith(action: wf.Action, form: FormData): Promise<void> {
  form.set("action", action);
  return actOnPurchase(form);
}
