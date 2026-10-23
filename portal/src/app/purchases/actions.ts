"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cardStore, ConflictError } from "@/lib/cards";
import { requireViewer, type Viewer } from "@/lib/viewer";
import { deliver } from "@/lib/notifications";
import { actorFor } from "@/lib/people";
import { checkComment, withComment } from "@/lib/comments";
import { purchaseCommentNotices, purchaseNotices } from "@/lib/purchases/notices";
import { checkFiles, checkW9, filesFrom, saveAttachments, saveW9 } from "@/lib/purchases/drive";
import { parsePurchaseInput, type PurchaseInput } from "@/lib/purchases/input";
import { FUNDS } from "@/lib/purchases/accounts";
import { type PurchaseContext, cardsHeldBy, personFunds, purchaseContext } from "@/lib/purchases/settings";
import { requestableFunds } from "@/lib/teams";
import { linkableEventsFor } from "@/lib/events/context";
import { vendorAfterPayment, vendorWithW9, vendorsForFund } from "@/lib/purchases/vendors";
import type { PurchaseDetails } from "@/lib/purchases/types";
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

/** `keep`: the fund and W-9 already on a request being edited; the W-9 needn't be uploaded again. */
async function parseForm(viewer: Viewer, form: FormData, ctx: PurchaseContext, keep?: { fund: string; w9?: PurchaseDetails["w9Uploaded"]; eventCardId?: string }) {
  let raw: PurchaseInput;
  try {
    raw = JSON.parse(String(form.get("payload") ?? "{}")) as PurchaseInput;
  } catch {
    return { ok: false as const, errors: ["The form couldn't be read. Reload the page and try again."] };
  }
  const store = await cardStore();
  // Only the list this person may see, and for S&W requests only S&W payees: the W-9 check matches what the form showed.
  const vendors = vendorsForFund(await store.listVendors(), viewer.actingRoles, String(raw.fund ?? ""));
  const w9Files = filesFrom(form, "w9");
  const parsed = parsePurchaseInput(
    { ...raw, w9Attached: w9Files.length > 0 || Boolean(keep?.w9) },
    {
      requesterName: viewer.name,
      cards: cardsHeldBy(ctx, viewer.email).map((c) => ({ last4: c.last4, fund: c.fund })),
      vendors,
      // Editing a returned request may keep its fund even if the person has since left that committee.
      funds: [...(await fundsFor(viewer, ctx)), ...(keep ? [keep.fund] : [])],
      // The events the form offered; a request being edited may keep the event it was linked to.
      events: [...(await linkableEventsFor(viewer)).map((e) => e.id), ...(keep?.eventCardId ? [keep.eventCardId] : [])],
    },
  );
  const files = filesFrom(form, "attachments");
  const fileErrors = [...checkFiles(files), ...checkW9(w9Files)];
  if (!parsed.ok || fileErrors.length) return { ok: false as const, errors: [...(parsed.ok ? [] : parsed.errors), ...fileErrors] };
  return { ok: true as const, details: parsed.details, files, w9File: parsed.details.w9Required ? w9Files[0] : undefined };
}

/** Upload the W-9 first: if it fails, nothing is submitted and the requester can try again. */
async function storeW9(payee: string | undefined, file: File | undefined, now: string): Promise<PurchaseDetails["w9Uploaded"] | "failed" | undefined> {
  if (!file || !payee) return undefined;
  try {
    const saved = await saveW9(payee, file);
    return { name: saved.name, at: now, ...(saved.driveFileId ? { driveFileId: saved.driveFileId } : {}) };
  } catch (err) {
    console.error("W-9 upload failed", err);
    return "failed";
  }
}
const W9_FAILED = "The W-9 didn't upload, so nothing was submitted. Try again, or ask the finance office for help.";

export async function createPurchase(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const ctx = await purchaseContext();
  const r = await parseForm(viewer, form, ctx);
  if (!r.ok) return { errors: r.errors };

  const store = await cardStore();
  const now = nowIso();
  const w9 = await storeW9(r.details.payee, r.w9File, now);
  if (w9 === "failed") return { errors: [W9_FAILED] };
  const draft = wf.newPurchase(w9 ? { ...r.details, w9Uploaded: w9 } : r.details, viewer.email, now);
  const routed = wf.submit(draft, actor, ctx.routing, now);
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
  const r = await parseForm(viewer, form, ctx, { fund: card.purchase.fund, w9: card.purchase.w9Uploaded, eventCardId: card.purchase.eventCardId });
  if (!r.ok) return { errors: r.errors };
  const now = nowIso();
  const w9 = await storeW9(r.details.payee, r.w9File, now);
  if (w9 === "failed") return { errors: [W9_FAILED] };
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
    w9Uploaded: w9 ?? card.purchase.w9Uploaded,
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
        const v = w9Received && card.purchase.w9Required ? vendorWithW9(await store.listVendors(), card.purchase, now) : null;
        if (v) await store.saveVendor(v);
        break;
      }
      case "return": {
        const to = String(form.get("returnTo") ?? "requester") as wf.ReturnTarget;
        next = wf.returnForChanges(card, actor, now, note, to);
        break;
      }
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
    // Paying a vendor saves them (address, fund, count) for every committee; S&W payees on their own restricted record.
    if (action === "pay") {
      const v = vendorAfterPayment(await store.listVendors(), card.purchase, now);
      if (v) await store.saveVendor(v);
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

/** A comment from anyone who can open the request. Never changes its stage. */
export async function commentOnPurchase(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const id = String(form.get("id") ?? "");
  const store = await cardStore();
  const check = checkComment(form.get("text"));
  let error: string | null = check.ok ? null : check.error;
  if (check.ok) {
    // Retry once if someone else saved the request at the same moment: a comment never needs to wait.
    for (let attempt = 0; attempt < 2; attempt++) {
      const card = await store.get(id);
      if (!wf.isPurchaseCard(card) || !wf.canViewDetail(card, { ...actor, seeAll: viewer.roles.includes("admins") })) redirect("/purchases");
      const next = withComment(card, { at: nowIso(), by: actor.email, name: viewer.name, text: check.text });
      try {
        await store.save(next, card.updatedAt);
        await deliver(purchaseCommentNotices(next, actor, check.text), actor.email);
        error = null;
        break;
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt === 1) {
          if (!(err instanceof ConflictError)) console.error("comment failed", err);
          error = "Your comment couldn't be saved. Try again.";
        }
      }
    }
  }
  revalidatePath(`/purchases/${id}`);
  redirect(error ? `/purchases/${id}?error=${encodeURIComponent(error)}#comments` : `/purchases/${id}?ok=commented#comments`);
}
