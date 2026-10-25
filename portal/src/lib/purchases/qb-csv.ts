/**
 * A CSV of purchase requests for entering in QuickBooks: one row per line
 * item, in plain columns the finance office can map to an import or copy
 * from. Only what's already on the request: no requester names or addresses,
 * and an aid request (restricted) shows no payee or line notes.
 */
import { findAccount, shortFund } from "./accounts";
import { KIND_LABEL } from "./types";
import { deskDate, PAY_TYPE_LABEL, payTypeOf } from "./finance-desk";
import type { PurchaseCard } from "./workflow";

export const QB_COLUMNS = ["Date", "Request", "Type", "Payee", "Fund (class)", "Account number", "Account", "Memo", "Amount", "Paid by", "Reference"] as const;

/** Quotes a cell when it needs it, and stops a spreadsheet reading text as a formula. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HIDDEN = "Restricted (see the request)";

function payeeOf(c: PurchaseCard, merchant?: string): string {
  const p = c.purchase;
  if (p.restricted) return HIDDEN;
  if (p.kind === "card") return [p.card ? `IAR card ···${p.card.last4}` : "IAR card", merchant].filter(Boolean).join(" · ");
  return p.payee ?? "";
}

export function qbRows(cards: PurchaseCard[]): string[][] {
  return cards.flatMap((c) => {
    const p = c.purchase;
    return p.lines.map((l) => {
      const a = findAccount(l.accountId);
      const memo = p.restricted ? p.description : [p.description, l.note].filter(Boolean).join(" · ");
      return [
        p.kind === "card" && l.date ? l.date : deskDate(c),
        c.id,
        KIND_LABEL[p.kind],
        payeeOf(c, l.merchant),
        shortFund(p.fund),
        a?.code ?? "",
        a?.name ?? "Unknown account",
        memo,
        l.amount.toFixed(2),
        p.payment ? p.payment.method : PAY_TYPE_LABEL[payTypeOf(c)],
        p.payment?.reference ?? "",
      ];
    });
  });
}

/** The whole file, with a header row and Windows line endings (Excel and QuickBooks both read it). */
export function qbCsv(cards: PurchaseCard[]): string {
  return [[...QB_COLUMNS], ...qbRows(cards)].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
