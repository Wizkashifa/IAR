import "server-only";
import { cardStore } from "../cards";
import { pastChoices, suggestAccounts, type StatementChoice } from "./statement";
import { cardOn, statementStore } from "./statements";
import { isPurchaseCard, type PurchaseCard } from "./workflow";

/**
 * What the card receipts form and its checks need from imported
 * statements: a cardholder's charges per month, a sub-account to start each
 * with, and whether receipts for that card and month were already sent.
 */

const ENDED = ["cancelled", "denied"];

/** The charges for a card in a month, and whether that month's statement is in at all. */
export async function statementFor(last4: string, month: string) {
  const s = /^\d{4}-\d{2}$/.test(month) ? await (await statementStore()).get(month) : null;
  return { statementIn: Boolean(s), statement: cardOn(s, last4) };
}

/** Card receipts made from an imported statement (their lines point at its charges), still open or done. */
async function statementReceipts(): Promise<PurchaseCard[]> {
  return (await (await cardStore()).listCardReceipts()).filter(isPurchaseCard).filter((c) => !ENDED.includes(c.status) && c.purchase.lines.some((l) => l.ref));
}

/** Receipts already sent (and not cancelled or declined) for a card and month, other than `except`. */
export async function receiptsSentFor(last4: string, month: string, except?: string): Promise<PurchaseCard[]> {
  return (await statementReceipts()).filter((c) => c.id !== except && c.purchase.card?.last4 === last4 && c.purchase.card.statementMonth === month);
}

/** Receipts already sent (and not cancelled or declined) from a month's statement, any card. */
export async function receiptsSentForMonth(month: string): Promise<PurchaseCard[]> {
  return (await statementReceipts()).filter((c) => c.purchase.card?.statementMonth === month);
}

/**
 * Each imported month's charges on the cards this person holds, most recent
 * first. `editing`: the request being changed, which doesn't count as sent.
 */
export async function statementChoices(holderEmail: string, cards: { last4: string }[], editing?: string): Promise<StatementChoice[]> {
  if (cards.length === 0) return [];
  const [statements, receipts] = await Promise.all([(await statementStore()).list(12), statementReceipts()]);
  const past = pastChoices(receipts.map((c) => ({ ownerEmail: c.ownerEmail, updatedAt: c.updatedAt, lines: c.purchase.lines })));
  return statements.flatMap((s) =>
    cards.flatMap((card) => {
      const sc = cardOn(s, card.last4);
      if (!sc) return [];
      const sent = receipts.find((c) => c.id !== editing && c.purchase.card?.last4 === card.last4 && c.purchase.card.statementMonth === s.month);
      return [{ month: s.month, last4: card.last4, charges: sc.charges, suggested: suggestAccounts(past, holderEmail, sc.charges), sentAs: sent?.id }];
    }),
  );
}
