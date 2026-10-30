/**
 * Payments as the portal's shared pages see it: who can open one,
 * its steps and what happens next, whether it waits on someone and on whom.
 * Collected in lib/registry.ts. Plain functions.
 */
import { NOTIFIED, STATUS_LABEL, STEP } from "../glossary";
import type { NeedsViewer } from "../needs-you";
import type { RowState } from "../card-row";
import type { ModuleDef } from "../registry";
import type { Holder } from "../stuck";
import { type NameOf, type StepOptions, type Steps, type Viewer, finish, quoted, speaker, track } from "../steps";
import { same } from "../text";
import { waitingOn } from "./reminders";
import { type PurchaseStage, STAGE_LABEL, openExpectedReturns, purchaseTotal } from "./types";
import { type PurchaseCard, actionableBy, canViewDetail, isPurchaseCard, permission } from "./workflow";

function purchaseSteps(card: PurchaseCard, o: StepOptions): Steps {
  const p = card.purchase;
  if (p.kind === "card") {
    const labels = [STEP.submitted, STEP.finance, STEP.quickbooks];
    const at = { chair: 1, finance: 1, executive: 1, payment: 2, books: 2, done: 3 }[p.stage];
    return finish(card, track(labels, at));
  }
  const passed = new Set(p.approvals.map((a) => a.stage));
  const exec = p.stage === "executive" || passed.has("executive") || (o.executiveThreshold != null && purchaseTotal(p) >= o.executiveThreshold);
  const labels: string[] = [STEP.submitted, STEP.chair, STEP.finance, ...(exec ? [STEP.executiveApproval] : []), STEP.toPay, STEP.paid];
  const index = (l: string) => labels.indexOf(l);
  const at = {
    chair: index(STEP.chair),
    finance: index(STEP.finance),
    executive: index(STEP.executiveApproval),
    payment: index(STEP.toPay),
    books: labels.length,
    done: labels.length,
  }[p.stage];
  // Sent straight to finance: no chair could approve it.
  const skip = p.stage !== "chair" && !passed.has("chair") ? [STEP.chair] : [];
  return finish(card, track(labels, at, skip));
}

function purchaseNext(card: PurchaseCard, viewer: Viewer, names: NameOf): string {
  const p = card.purchase;
  const s = speaker(viewer, names);
  const mine = same(card.ownerEmail, viewer.email);
  const notified = mine ? ` ${NOTIFIED}` : "";
  // Nobody acts on their own request, so "You" only for someone else's.
  const acts = (role: string) => !mine && (viewer.actingRoles ?? []).includes(role);
  const finance = acts("finance") ? "You" : "The finance office";
  if (card.status === "changes_requested") return `${s.does(card.ownerEmail, "make", "makes")} the changes asked for${quoted(p.returnNote)} and ${mine ? "send" : "sends"} it again.`;
  if (card.status === "denied" || card.status === "cancelled") return "";
  switch (p.stage) {
    case "chair":
      return `${p.approverEmail ? s.does(p.approverEmail, "approve", "approves") : "The committee's chair approves"} it for ${card.committee || p.fund}, then the finance office reviews it.${notified}`;
    case "finance":
      return p.kind === "card"
        ? `${finance} ${acts("finance") ? "check" : "checks"} the charges and receipts, then ${acts("finance") ? "enter" : "enters"} them in QuickBooks.${notified}`
        : `${finance} ${acts("finance") ? "check" : "checks"} the receipts and accounts, then it's paid.${notified}`;
    case "executive":
      return acts("executive") ? "You approve it as an executive, then the finance office pays it." : `An executive approves it, then the finance office pays it.${notified}`;
    case "payment":
      return `${finance} ${acts("finance") ? "pay" : "pays"} ${p.payee || "it"}.${mine ? " You'll be notified when it's paid." : ""}`;
    case "books":
      return `${finance} ${acts("finance") ? "enter" : "enters"} it in QuickBooks.`;
    case "done": {
      const open = openExpectedReturns(p).length;
      return open ? `The finance office records the ${open} refund${open === 1 ? "" : "s"} or repayment${open === 1 ? "" : "s"} still owed.` : "";
    }
  }
}

function purchaseNeeds(card: PurchaseCard, v: NeedsViewer): boolean {
  if (actionableBy([card], v).length) return true;
  // Finance records refunds and repayments still owed on a finished request.
  return openExpectedReturns(card.purchase).length > 0 && permission(card, v, "resolve").ok;
}

function holder(card: PurchaseCard): Holder | null {
  const p = card.purchase;
  if (card.status === "changes_requested") return { to: [{ email: card.ownerEmail }], step: "Back with the requester" };
  if (p.stage === "chair" && !p.approverEmail) return { to: [], step: STAGE_LABEL.chair };
  const who = waitingOn(card);
  // QuickBooks entry is the finance office's batch work: not "stuck", same as the daily job.
  return who ? { to: [who], step: STAGE_LABEL[p.stage] } : null;
}

/** The list pill: what's needed from you, or who has it (see ModuleDef.rowStatus). */
const ACT: Record<PurchaseStage, string> = {
  chair: "Needs your approval",
  finance: "Needs your review",
  executive: "Needs your approval",
  payment: "Ready for you to pay",
  books: "Ready to enter in QuickBooks",
  done: "Needs a refund recorded",
};
const WITH: Record<PurchaseStage, string> = {
  chair: "With the chair",
  finance: "With finance",
  executive: "With an executive",
  payment: "With finance to pay",
  books: "With finance",
  done: "Paid",
};

function rowStatus(card: PurchaseCard, state: RowState): string | undefined {
  const stage = card.purchase.stage;
  if (card.status === "denied") return "Turned down";
  if (card.status === "cancelled") return "Cancelled";
  if (card.status === "changes_requested") return state === "act" ? "Needs changes from you" : "With the requester";
  if (state === "act") return ACT[stage];
  if (state === "wait") return WITH[stage];
  // Card receipts aren't paid: finance checks them, then enters them in QuickBooks.
  if (card.purchase.kind === "card" && stage === "books") return "Checked, to enter in QuickBooks";
  if (card.purchase.kind === "card" && stage === "done") return "Entered in QuickBooks";
  if (stage === "done" || card.status === "paid" || stage === "books") return "Paid";
  if (stage === "payment") return "Approved, to pay";
  return undefined;
}

export const purchaseModule: ModuleDef<PurchaseCard> = {
  type: "purchase",
  is: isPurchaseCard,
  canView: canViewDetail,
  statusText: (card) => STATUS_LABEL[card.status],
  steps: purchaseSteps,
  next: purchaseNext,
  needs: purchaseNeeds,
  holder,
  rowStatus,
};
