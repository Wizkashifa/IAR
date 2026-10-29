/**
 * The finance desk (app/purchases/finance): what's waiting on the finance
 * office after approval, filtered by fund, month and payment type, and
 * worked several at a time. Plain functions: the page and its actions call
 * them, and every change still goes through workflow.ts one request at a time.
 */
import type { Role } from "../org";
import { openExpectedReturns, paymentMethodOf, type LineItem } from "./types";
import type { PurchaseCard } from "./workflow";
import { WorkflowError } from "../workflow-core";

/**
 * Who can open the desk and the card statements: finance works them, and
 * executives see them (every request and card receipt there) without acting.
 * `roles` is what someone can see; admins pass too, also without acting.
 */
export const mayViewDesk = (roles: readonly Role[]) => roles.includes("finance") || roles.includes("executive");
/** Who can pay, book and record on the desk: finance, from their own groups (`actingRoles`). */
export const mayWorkDesk = (actingRoles: readonly Role[]) => actingRoles.includes("finance");

export type DeskTab = "pay" | "books" | "returns";
export const DESK_TABS: { id: DeskTab; label: string }[] = [
  { id: "pay", label: "To pay" },
  { id: "books", label: "To enter in QuickBooks" },
  { id: "returns", label: "Refunds owed" },
];

/** Check, ACH, or an IAR card statement. */
export type DeskPayType = "check" | "ach" | "card";
export const PAY_TYPE_LABEL: Record<DeskPayType, string> = { check: "Check", ach: "ACH", card: "IAR card" };

export type DeskFilter = { fund?: string; month?: string; type?: DeskPayType };

export const isDeskTab = (s: string | undefined): s is DeskTab => s === "pay" || s === "books" || s === "returns";
export const isPayType = (s: string | undefined): s is DeskPayType => s === "check" || s === "ach" || s === "card";

const live = (c: PurchaseCard) => c.status !== "cancelled" && c.status !== "denied" && c.status !== "changes_requested";

/** The requests on one tab: approved and waiting to be paid, paid and waiting for QuickBooks, or with a refund or repayment still owed. */
export function deskCards(cards: PurchaseCard[], tab: DeskTab): PurchaseCard[] {
  const on = cards.filter((c) => {
    if (tab === "returns") return c.status !== "cancelled" && openExpectedReturns(c.purchase).length > 0;
    return live(c) && c.purchase.stage === (tab === "pay" ? "payment" : "books");
  });
  return on.sort((a, b) => a.purchase.stageSince.localeCompare(b.purchase.stageSince));
}

export function payTypeOf(c: PurchaseCard): DeskPayType {
  if (c.purchase.kind === "card") return "card";
  return paymentMethodOf(c.purchase.delivery) ?? "check";
}

/**
 * The date finance files a request under: when it was paid, the statement
 * month for card receipts, otherwise when it was sent. The month filter and
 * the CSV both use it.
 */
export function deskDate(c: PurchaseCard): string {
  if (c.purchase.payment?.at) return c.purchase.payment.at.slice(0, 10);
  if (c.purchase.card) return `${c.purchase.card.statementMonth}-01`;
  return (c.createdAt ?? c.updatedAt).slice(0, 10);
}

export function filterDesk(cards: PurchaseCard[], f: DeskFilter): PurchaseCard[] {
  return cards.filter((c) => (!f.fund || c.purchase.fund === f.fund) && (!f.month || deskDate(c).startsWith(f.month)) && (!f.type || payTypeOf(c) === f.type));
}

/** The funds and months present, for the filter menus (months newest first). */
export function deskOptions(cards: PurchaseCard[]): { funds: string[]; months: string[] } {
  const funds = [...new Set(cards.map((c) => c.purchase.fund))].sort((a, b) => a.localeCompare(b));
  const months = [...new Set(cards.map((c) => deskDate(c).slice(0, 7)))].sort().reverse();
  return { funds, months };
}

/** The card receipts sent from one month's statement, by card (cancelled and declined ones don't count). */
export function statementReceipts(cards: PurchaseCard[], month: string): PurchaseCard[] {
  return cards
    .filter((c) => c.purchase.kind === "card" && c.purchase.card?.statementMonth === month && c.status !== "cancelled" && c.status !== "denied")
    .sort((a, b) => (a.purchase.card!.last4 < b.purchase.card!.last4 ? -1 : 1));
}

/** Refunds and repayments still owed, one per line, for the Refunds owed tab. */
export function openReturns(cards: PurchaseCard[]): { card: PurchaseCard; line: LineItem }[] {
  return cards.flatMap((card) => openExpectedReturns(card.purchase).map((line) => ({ card, line })));
}

/** "PO-12:l3" for a line on the Refunds owed tab; plain "PO-12" elsewhere. */
export const lineKey = (cardId: string, lineId: string) => `${cardId}:${lineId}`;
export function splitKey(key: string): { id: string; line?: string } {
  const i = key.indexOf(":");
  return i < 0 ? { id: key } : { id: key.slice(0, i), line: key.slice(i + 1) };
}

export type BatchResult = { done: PurchaseCard[]; failed: { id: string; message: string }[] };

/**
 * Runs one workflow step over several requests. A request the step refuses
 * (not finance's turn, missing reference, already done) is listed with the
 * workflow's own reason, and the rest still go through. Nothing is saved here.
 */
export function runBatch(cards: PurchaseCard[], step: (c: PurchaseCard) => PurchaseCard): BatchResult {
  const out: BatchResult = { done: [], failed: [] };
  for (const c of cards) {
    try {
      out.done.push(step(c));
    } catch (err) {
      if (!(err instanceof WorkflowError)) throw err;
      out.failed.push({ id: c.id, message: err.message });
    }
  }
  return out;
}

/** "3 marked paid." and, when some didn't go through, "1 didn't: …" */
export function batchSummary(done: number, verb: string, failed: number): string {
  const head = done === 0 ? "Nothing was changed." : `${done} ${verb}.`;
  return failed ? `${head} ${failed} didn't go through; see below.` : head;
}
