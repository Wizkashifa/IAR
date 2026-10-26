/**
 * Purchase Requests: the fields a purchase card carries on top of the shared
 * Card (see lib/cards.ts).
 */
import type { HistoryEntry } from "../workflow-core";

/** Pay a vendor or person, reimburse the requester, or IAR credit card receipts. */
export type PurchaseKind = "pay" | "reimburse" | "card";

/**
 * Where the request is in its approval chain. The shared Card.status is
 * derived from this (see statusForStage in workflow.ts).
 *
 * chair → finance → executive (only above the threshold) → payment → books → done
 * Card receipts skip chair, executive and payment: the money is already spent.
 */
export type PurchaseStage = "chair" | "finance" | "executive" | "payment" | "books" | "done";

/** How the check goes. "ach" (a bank transfer) is only on older requests: new ones are always paid by check. */
export type DeliveryMethod = "committee_box" | "office_pickup" | "security" | "mail" | "ach";

export type PaymentMethod = "check" | "ach";

export type LineFlag = "refund" | "repay";

export type LineItem = {
  id: string;
  accountId: string;
  /** Dollars, positive, at most two decimals. */
  amount: number;
  note?: string;
  /** Card receipts only: charge date (YYYY-MM-DD) and merchant. */
  date?: string;
  merchant?: string;
  /** False when the requester says a receipt is missing for this line. */
  hasReceipt: boolean;
  /** A charge expected back: a refund from the merchant, or repayment by someone. */
  flag?: LineFlag;
  repayBy?: string;
  /** Set by finance once the refund or repayment arrives. */
  resolvedAt?: string;
  resolvedBy?: string;
};

export type Attachment = {
  name: string;
  size: number;
  /** Google Drive file ID in the PO records Shared Drive (production). */
  driveFileId?: string;
  url?: string;
};


/**
 * `onBehalfOf`: the away approver whose step this was, when someone covering approved it.
 * `asDirector`: the committee's director took the chair step.
 */
export type Approval = { stage: PurchaseStage; by: string; at: string; onBehalfOf?: string; asDirector?: boolean };

export type PurchaseDetails = {
  kind: PurchaseKind;
  /** The fund (committee) the request is charged to. */
  fund: string;
  description: string;

  /** Pay and reimburse. For reimburse, the payee is the requester. */
  payee?: string;
  invoiceNumber?: string;
  delivery?: DeliveryMethod;
  /** Required for every check, wherever it goes; IAR records the payee's address. */
  mailingAddress?: string;
  /** Pay only: labor (ticked, or a labor sub-account) needs a W-9 on file. */
  isLabor?: boolean;
  w9Required?: boolean;
  /**
   * The W-9 the requester uploaded. The file is only in the restricted W-9
   * drive; its ID is for finance and never goes in a notice.
   */
  w9Uploaded?: { name: string; at: string; driveFileId?: string };
  /** Requester's disclosure: the payee is a Shura or committee member, or a business one controls. */
  relatedParty?: boolean;

  /** Card receipts only. */
  card?: { last4: string; statementMonth: string };

  lines: LineItem[];
  attachments: Attachment[];

  stage: PurchaseStage;
  /** When the current stage started, for "days waiting" and reminders. */
  stageSince: string;
  /** The one person the chair stage waits on (the chair, or the backup). */
  approverEmail?: string;
  approvals: Approval[];
  payment?: { method: string; reference: string; at: string; by: string };
  books?: { at: string; by: string };
  /** Aid to individuals: payee and line detail hidden from everyone but S&W and finance. */
  restricted: boolean;
  attestation: { name: string; at: string };
  /** Note from the approver who returned or rejected it. */
  returnNote?: string;
  history: HistoryEntry[];
  /** Optional link to an event card, so event costs roll up at close-out. */
  eventCardId?: string;
  /** Denormalized for queries: a refund or repayment is still outstanding. Set by the store. */
  hasOpenReturns?: boolean;
  /** The daily job's reminder and escalation for the current stage, so each is sent once (see reminders.ts). */
  followUp?: { stage: PurchaseStage; since: string; remindedAt?: string; escalatedAt?: string };
};

export const KIND_LABEL: Record<PurchaseKind, string> = {
  pay: "Pay a vendor or person",
  reimburse: "Reimburse me",
  card: "IAR credit card receipts",
};

export const STAGE_LABEL: Record<PurchaseStage, string> = {
  chair: "Chair approval",
  finance: "Finance review",
  executive: "Executive approval",
  payment: "To pay",
  books: "Enter in QuickBooks",
  done: "Complete",
};

export const DELIVERY_LABEL: Record<DeliveryMethod, string> = {
  committee_box: "Leave check in the committee's box (EC Room #280)",
  office_pickup: "Pick up at the Admin office",
  security: "Leave with the security office",
  mail: "Mail check to payee",
  ach: "ACH / direct transfer",
};

/** Where a check can go, in the order the form offers them. */
export const CHECK_DELIVERIES: Exclude<DeliveryMethod, "ach">[] = ["committee_box", "office_pickup", "security", "mail"];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { check: "Check", ach: "ACH (bank transfer)" };

export function paymentMethodOf(delivery: DeliveryMethod | undefined): PaymentMethod | undefined {
  if (!delivery) return undefined;
  return delivery === "ach" ? "ach" : "check";
}

/** "Check · Leave check in the committee's box" or "ACH (bank transfer)". */
export function paymentLabel(delivery: DeliveryMethod): string {
  return delivery === "ach" ? PAYMENT_METHOD_LABEL.ach : `Check · ${DELIVERY_LABEL[delivery]}`;
}

export function purchaseTotal(p: Pick<PurchaseDetails, "lines">): number {
  return Math.round(p.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
}

/** Refund or repayment lines still waiting for the money to come back. */
export function openExpectedReturns(p: Pick<PurchaseDetails, "lines">): LineItem[] {
  return p.lines.filter((l) => l.flag && !l.resolvedAt);
}
