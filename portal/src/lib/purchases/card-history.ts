/**
 * One IAR card's charges across the statements finance has uploaded, each
 * matched to the line its cardholder sent in for it (sub-account, why it was
 * bought, receipt), for the card's page (app/purchases/cards). Plain
 * functions: the page loads the statements and receipt requests.
 */
import type { Statement, StatementCharge } from "./statement";
import { merchantName } from "./statement";
import type { LineItem } from "./types";
import type { PurchaseCard } from "./workflow";

export type CardCharge = StatementCharge & { merchant: string; line?: LineItem };
export type CardMonth = {
  month: string;
  holderName: string;
  total: number;
  charges: CardCharge[];
  /** The receipt request sent for this card and month, if any (cancelled and declined ones don't count). */
  request?: PurchaseCard;
};

/** The card's months, newest first, with each charge and its line from the receipt request. */
export function cardHistory(statements: Pick<Statement, "month" | "cards">[], requests: PurchaseCard[], last4: string): CardMonth[] {
  const months: CardMonth[] = [];
  for (const s of statements) {
    const card = s.cards.find((c) => c.last4 === last4);
    if (!card) continue;
    const request = requests.find(
      (r) => r.purchase.kind === "card" && r.purchase.card?.last4 === last4 && r.purchase.card.statementMonth === s.month && r.status !== "cancelled" && r.status !== "denied",
    );
    const byRef = new Map((request?.purchase.lines ?? []).filter((l) => l.ref).map((l) => [l.ref!, l]));
    months.push({
      month: s.month,
      holderName: card.holderName,
      total: card.total,
      charges: card.charges.map((c) => ({ ...c, merchant: merchantName(c.description), line: byRef.get(c.ref) })),
      request,
    });
  }
  return months.sort((a, b) => b.month.localeCompare(a.month));
}

/** Totals across the months shown: charges, dollars, and charges with no receipt in yet (credits need none). */
export function cardTotals(months: CardMonth[]): { charges: number; total: number; missing: number } {
  const all = months.flatMap((m) => m.charges);
  return {
    charges: all.length,
    total: Math.round(months.reduce((s, m) => s + m.total, 0) * 100) / 100,
    missing: all.filter((c) => c.amount > 0 && !(c.line?.hasReceipt)).length,
  };
}
