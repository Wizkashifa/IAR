"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cardStore, ConflictError } from "@/lib/cards";
import { requireViewer, type Viewer } from "@/lib/viewer";
import { deliver } from "@/lib/notifications";
import { actorFor } from "@/lib/people";
import { purchaseCommentNotices, purchaseNotices, receiptsAddedNotices } from "@/lib/purchases/notices";
import { checkFiles, checkW9, filesFrom, saveAttachments, saveCardReceipt, saveW9 } from "@/lib/purchases/drive";
import { parsePurchaseInput, receiptsError, type PurchaseInput } from "@/lib/purchases/input";
import { FUNDS } from "@/lib/purchases/accounts";
import { type PurchaseContext, cardsHeldBy, personFunds, purchaseContext } from "@/lib/purchases/settings";
import { receiptsSentFor, statementFor } from "@/lib/purchases/statement-context";
import { requestableFunds } from "@/lib/teams";
import { linkableEventsFor } from "@/lib/events/context";
import { vendorAfterPayment, vendorWithW9, vendorsForFund } from "@/lib/purchases/vendors";
import type { Attachment, PurchaseDetails } from "@/lib/purchases/types";
import { receiptUploadStore } from "@/lib/purchases/receipt-uploads";
import * as wf from "@/lib/purchases/workflow";
import { WorkflowError } from "@/lib/workflow-core";
import { actOnCard, commentOnCard, unknownAction } from "@/lib/card-actions";
import type { FormState } from "@/components/FormErrors";
import { nowIso } from "@/lib/dates";

const directorsFor = (ctx: PurchaseContext, c: wf.PurchaseCard) => {
  const a = ctx.routing.approversFor(c.purchase.fund);
  return { directors: a.directors, chairs: a.chairs };
};

/** Funds this person may charge: their teams' and the ones they direct; office and finance any. */
export async function fundsFor(viewer: Viewer, ctx: PurchaseContext): Promise<string[]> {
  return requestableFunds(personFunds(ctx, viewer.email).request, viewer.actingRoles, FUNDS);
}

/** `keep`: the fund and W-9 already on a request being edited; the W-9 needn't be uploaded again. */
async function parseForm(viewer: Viewer, form: FormData, ctx: PurchaseContext, keep?: { id: string; fund: string; w9?: PurchaseDetails["w9Uploaded"]; eventCardId?: string; attachments: Attachment[] }) {
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
  // Card receipts: the charges come from the imported statement, never from the browser.
  const card = raw.kind === "card" ? await statementFor(String(raw.cardLast4 ?? ""), String(raw.statementMonth ?? "")) : undefined;
  // Card receipts: each charge's receipts were uploaded one by one; the lines name them, and only this person's count.
  const uploadIds = raw.kind === "card" && Array.isArray(raw.lines) ? [...new Set(raw.lines.flatMap((l) => (Array.isArray(l.receipts) ? l.receipts : [])).map(String))].slice(0, 300) : [];
  const uploads = uploadIds.length ? await (await receiptUploadStore()).getMany(uploadIds) : [];
  const parsed = parsePurchaseInput(
    { ...raw, w9Attached: w9Files.length > 0 || Boolean(keep?.w9) },
    {
      requesterName: viewer.name,
      cards: cardsHeldBy(ctx, viewer.email).map((c) => ({ last4: c.last4 })),
      vendors,
      // Editing a returned request may keep its fund even if the person has since left that committee.
      funds: [...(await fundsFor(viewer, ctx)), ...(keep ? [keep.fund] : [])],
      // The events the form offered; a request being edited may keep the event it was linked to.
      events: [...(await linkableEventsFor(viewer)).map((e) => e.id), ...(keep?.eventCardId ? [keep.eventCardId] : [])],
      ...card,
      uploads,
      requesterEmail: viewer.email,
      existingReceipts: keep?.attachments ?? [],
    },
  );
  // One set of receipts per card and month.
  if (parsed.ok && parsed.details.card) {
    const sent = await receiptsSentFor(parsed.details.card.last4, parsed.details.card.statementMonth, keep?.id);
    if (sent.length) return { ok: false as const, errors: [`Receipts for this card and month were already sent as ${sent[0].id}.`] };
  }
  const files = filesFrom(form, "attachments");
  if (parsed.ok && (keep?.attachments.length ?? 0) + parsed.receipts.length + files.length > wf.MAX_ATTACHMENTS)
    return { ok: false as const, errors: [`A request holds at most ${wf.MAX_ATTACHMENTS} receipts and files. Lump repeat stores together, or send fewer files.`] };
  // Card receipts are checked charge by charge (above); everything else needs at least one file.
  const noReceipts = raw.kind === "card" ? null : receiptsError(keep?.attachments.length ?? 0, files.length);
  const fileErrors = [...checkFiles(files), ...checkW9(w9Files), ...(noReceipts ? [noReceipts] : [])];
  if (!parsed.ok || fileErrors.length) return { ok: false as const, errors: [...(parsed.ok ? [] : parsed.errors), ...fileErrors] };
  return { ok: true as const, details: parsed.details, receipts: parsed.receipts, files, w9File: parsed.details.w9Required ? w9Files[0] : undefined };
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
  const draft = wf.newPurchase(w9 ? { ...r.details, w9Uploaded: w9 } : r.details, viewer.email, now, r.receipts);
  const routed = wf.submit(draft, actor, ctx.routing, now);
  const { id: _blank, ...toCreate } = routed;
  const created = (await store.create(toCreate, "PO")) as wf.PurchaseCard;
  await deliver(purchaseNotices(null, created, actor, directorsFor(ctx, created)), actor.email);

  if (r.files.length) {
    try {
      const attachments = await saveAttachments(created.id, created.purchase.fund, r.files);
      const withFiles: wf.PurchaseCard = {
        ...created,
        purchase: { ...created.purchase, attachments: [...created.purchase.attachments, ...attachments], history: [...created.purchase.history, { at: nowIso(), by: actor.email, action: `Attached ${attachments.length} file${attachments.length === 1 ? "" : "s"}` }] },
        updatedAt: nowIso(),
      };
      await store.save(withFiles, created.updatedAt);
    } catch (err) {
      console.error("attachment upload failed", err);
      redirect(`/purchases/${created.id}?error=${encodeURIComponent("Your request was submitted, but the files didn't upload. Send them to the finance office with the request number.")}`);
    }
  }
  revalidatePath("/purchases");
  redirect(`/purchases/${created.id}?sent=1`);
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
  const r = await parseForm(viewer, form, ctx, { id: card.id, fund: card.purchase.fund, w9: card.purchase.w9Uploaded, eventCardId: card.purchase.eventCardId, attachments: card.purchase.attachments });
  if (!r.ok) return { errors: r.errors };
  const now = nowIso();
  const w9 = await storeW9(r.details.payee, r.w9File, now);
  if (w9 === "failed") return { errors: [W9_FAILED] };
  let attachments = [...card.purchase.attachments, ...r.receipts];
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
    return { errors: [err instanceof ConflictError || err instanceof WorkflowError ? err.message : "Something went wrong saving the request."] };
  }
  revalidatePath("/purchases");
  redirect(`/purchases/${id}?sent=1`);
}

const purchases = { path: "/purchases", is: wf.isPurchaseCard };

/** Approve, return, reject, pay, book, resolve a refund/repayment, or cancel. */
export async function actOnPurchase(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const note = String(form.get("note") ?? "").slice(0, 1000);
  const store = await cardStore();
  const ctx = await purchaseContext();
  const s = ctx.routing;
  await actOnCard(form, viewer, {
    ...purchases,
    async act(card, action, now) {
      let next: wf.PurchaseCard;
      let after: (() => Promise<void>) | undefined;
      switch (action as wf.Action) {
        case "approve": {
          const w9Received = form.get("w9Received") === "on";
          next = wf.approve(card, actor, s, now, { note: note || undefined, w9Received });
          const v = w9Received && card.purchase.w9Required ? vendorWithW9(await store.listVendors(), card.purchase, now) : null;
          if (v) await store.saveVendor(v);
          break;
        }
        case "return":
          next = wf.returnForChanges(card, actor, now, note, String(form.get("returnTo") ?? "requester") as wf.ReturnTarget);
          break;
        case "reject":
          next = wf.reject(card, actor, now, note);
          break;
        case "pay":
          next = wf.recordPayment(card, actor, now, String(form.get("method") ?? ""), String(form.get("reference") ?? ""));
          // Paying a vendor saves them (address, fund, count) for every committee; S&W payees on their own restricted record.
          after = async () => {
            const v = vendorAfterPayment(await store.listVendors(), card.purchase, now);
            if (v) await store.saveVendor(v);
          };
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
        case "attach": {
          // Check before uploading, so nothing reaches Drive for a request that can't take it.
          wf.mustDo(card, actor, "attach");
          const files = filesFrom(form, "attachments");
          const bad = checkFiles(files);
          if (bad.length) throw new WorkflowError(bad.join(" "));
          if (files.length === 0) throw new WorkflowError("Choose the receipts to add first.");
          let saved;
          try {
            // Card receipts: with the rest of that card's month, so its folder has every receipt.
            const cm = card.purchase.kind === "card" ? card.purchase.card : undefined;
            if (cm) {
              // One at a time: each finds or makes the month's folder, and two at once could make it twice.
              saved = [];
              for (const f of files) saved.push(await saveCardReceipt(cm.last4, cm.statementMonth, f));
            } else saved = await saveAttachments(card.id, card.purchase.fund, files);
          } catch (err) {
            console.error("attachment upload failed", err);
            throw new WorkflowError("The receipts didn't upload, so nothing was added. Try again, or send fewer at a time.");
          }
          next = wf.addAttachments(card, actor, now, saved);
          return { next, notices: receiptsAddedNotices(next, actor, saved.length) };
        }
        default:
          return unknownAction();
      }
      return { next, notices: purchaseNotices(card, next, actor, directorsFor(ctx, next)), after };
    },
  });
}

export async function commentOnPurchase(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  await commentOnCard(form, viewer, { ...purchases, notices: (card, text) => purchaseCommentNotices(card, actor, text) });
}
