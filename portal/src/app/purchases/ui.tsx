import { ItemRow } from "@/components/ItemRow";
import { Pill } from "@/components/Pill";
import type { RowData } from "@/lib/card-row";
import { STAGE_LABEL } from "@/lib/purchases/types";
import { ESCALATE_DAYS, REMINDER_DAYS, daysWaiting, type PurchaseCard } from "@/lib/purchases/workflow";

export { fmtDate, fmtDateTime, fmtMoney, fmtMonth } from "@/lib/format";

/** A purchase's status in words, by its step: "Chair approval", "To pay", "Sent back". */
export function purchaseStatus(card: PurchaseCard): string {
  const p = card.purchase;
  if (card.status === "changes_requested") return "Sent back";
  if (card.status === "denied") return "Declined";
  if (card.status === "cancelled") return "Cancelled";
  if (card.status === "closed" || p.stage === "done") return "Complete";
  if (card.status === "paid") return "Paid";
  if (p.stage === "payment") return "Approved, to pay";
  return STAGE_LABEL[p.stage];
}

/** How long a request has sat at its step, coloured once a reminder (warn) or escalation (bad) is due. */
export function WaitingPill({ card }: { card: PurchaseCard }) {
  const open = card.status === "in_review" || card.status === "approved" || card.status === "paid";
  if (!open) return null;
  const days = daysWaiting(card);
  if (days === 0) return null;
  const tone = days >= ESCALATE_DAYS ? "bad" : days >= REMINDER_DAYS ? "warn" : "neutral";
  return (
    <Pill tone={tone} title="Days waiting at this step">
      {`${days} day${days === 1 ? "" : "s"} waiting`}
    </Pill>
  );
}

/**
 * A purchase in a list. `redacted` hides the title and payee of a Social &
 * Welfare request the person can't open, and leaves the row unlinked.
 */
export function PurchaseRow({ row, card, redacted, days }: { row: RowData; card: PurchaseCard; redacted?: boolean; days?: boolean }) {
  if (redacted) {
    return <ItemRow title="Social & Welfare request" id={row.id} sub="Details are for Social & Welfare, the finance office and executives" status={row.status} state={row.state} />;
  }
  return <ItemRow title={row.title} id={row.id} href={row.href} sub={row.sub} who={row.who} status={row.status} state={row.state} right={days ? <WaitingPill card={card} /> : undefined} />;
}

/** What a `?ok=` from a server action says (components/FlashNote.tsx). */
export const OK_TEXT: Record<string, string> = {
  resubmitted: "Changes saved and the request is back in review.",
  approve: "Approved.",
  return: "Sent back with your note.",
  saved: "Vendor saved.",
  merged: "Vendors merged.",
  reject: "Declined.",
  pay: "Payment recorded.",
  books: "Marked as entered in QuickBooks.",
  resolve: "Recorded.",
  cancel: "Request cancelled.",
  attach: "Receipts added. Add more any time until the request is done.",
  commented: "Comment added. The people on this request can see it.",
};
