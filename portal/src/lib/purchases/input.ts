/**
 * Turning what someone typed into the request form into PurchaseDetails, with
 * the checks the old form couldn't make. Plain functions, so they're tested
 * without a server (see purchases.test.ts).
 */
import { FUNDS, findAccount, isLaborAccount } from "./accounts";
import {
  CHECK_DELIVERIES,
  type DeliveryMethod,
  type LineItem,
  type PurchaseDetails,
  type PurchaseKind,
} from "./types";

export type LineInput = {
  accountId: string;
  amount: string | number;
  note?: string;
  date?: string;
  merchant?: string;
  hasReceipt?: boolean;
  flag?: "" | "refund" | "repay";
  repayBy?: string;
};

export type PurchaseInput = {
  kind: string;
  fund: string;
  description: string;
  payee?: string;
  invoiceNumber?: string;
  /** Always "check" from the form; `delivery` says how the check goes. */
  paymentMethod?: string;
  delivery?: string;
  mailingAddress?: string;
  isLabor?: boolean;
  /** Set by the server, never by the browser: a W-9 file came with the form, or is already on the request. */
  w9Attached?: boolean;
  relatedParty?: boolean;
  cardLast4?: string;
  statementMonth?: string;
  lines: LineInput[];
  attestationName: string;
  eventCardId?: string;
};

export type InputContext = {
  requesterName: string;
  /** Cards this person holds (last four digits → fund). */
  cards: { last4: string; fund: string }[];
  /** Saved vendors, to decide whether a W-9 is needed. */
  vendors: { name: string; w9OnFile: boolean }[];
  /** Funds this person may charge (their committees and teams'). Card receipts follow the card's fund. Unset: any fund. */
  funds?: string[];
  /** Event cards (EV-…) this person may link the purchase to. Unset: any (sample data). */
  events?: string[];
};

export type ParseResult = { ok: true; details: Omit<PurchaseDetails, "stage" | "stageSince" | "approvals" | "history" | "restricted" | "attachments"> } | { ok: false; errors: string[] };

const KINDS: PurchaseKind[] = ["pay", "reimburse", "card"];
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Dollars from "1,180.00", "$90" or 90; NaN if it isn't a usable amount. */
export function parseAmount(v: string | number): number {
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  if (Math.round(n * 100) !== Math.round(n * 1000) / 10) return NaN; // more than two decimals
  return Math.round(n * 100) / 100;
}

export function parsePurchaseInput(raw: PurchaseInput, ctx: InputContext): ParseResult {
  const errors: string[] = [];
  const kind = raw.kind as PurchaseKind;
  if (!KINDS.includes(kind)) return { ok: false, errors: ["Choose what kind of request this is."] };

  let fund = str(raw.fund, 120);
  const description = str(raw.description, 200);
  if (description.length < 3) errors.push("Describe what this is for.");

  let card: PurchaseDetails["card"];
  if (kind === "card") {
    const held = ctx.cards.find((c) => c.last4 === str(raw.cardLast4, 4));
    if (!held) errors.push("Choose one of your IAR cards.");
    else fund = held.fund;
    const month = str(raw.statementMonth, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) errors.push("Choose the statement month.");
    if (held) card = { last4: held.last4, statementMonth: month };
  }
  if (!FUNDS.includes(fund)) errors.push("Choose the fund or committee this is charged to.");
  else if (kind !== "card" && ctx.funds && !ctx.funds.includes(fund)) errors.push("You can only charge the funds of committees and teams you're on. Ask a member of that committee to submit it.");

  // Payee and payment: not for card receipts.
  let payee: string | undefined;
  let delivery: DeliveryMethod | undefined;
  let mailingAddress: string | undefined;
  if (kind !== "card") {
    payee = kind === "reimburse" ? ctx.requesterName : str(raw.payee, 120);
    if (!payee) errors.push("Who should be paid?");
    delivery = str(raw.delivery, 40) as DeliveryMethod;
    // Requests are paid by check (finance can still record an ACH payment on the desk).
    if (!CHECK_DELIVERIES.includes(delivery as (typeof CHECK_DELIVERIES)[number])) {
      errors.push("Choose how we should send the check.");
      delivery = undefined;
    } else {
      // Every check, wherever it goes: IAR records the payee's address.
      mailingAddress = str(raw.mailingAddress, 300);
      if (mailingAddress.length < 8) errors.push(kind === "reimburse" ? "Enter your mailing address. IAR records it for every check." : "Enter the payee's mailing address. IAR records it for every check.");
    }
  }

  // Lines.
  const rawLines = Array.isArray(raw.lines) ? raw.lines : [];
  if (rawLines.length === 0) errors.push("Add at least one line.");
  if (rawLines.length > 60) errors.push("Split this into more than one request (60 lines at most).");
  const lines: LineItem[] = [];
  rawLines.slice(0, 60).forEach((l, i) => {
    const n = i + 1;
    const account = findAccount(str(l.accountId, 20));
    if (!account) errors.push(`Line ${n}: choose a sub-account.`);
    const amount = parseAmount(l.amount);
    if (!(amount > 0) || amount > 1_000_000) errors.push(`Line ${n}: enter an amount over $0 with at most two decimals.`);
    const line: LineItem = { id: `L${n}`, accountId: account?.id ?? "", amount: amount > 0 ? amount : 0, hasReceipt: l.hasReceipt !== false };
    const note = str(l.note, 200);
    if (note) line.note = note;
    if (kind === "card") {
      const date = str(l.date, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push(`Line ${n}: enter the charge date.`);
      else line.date = date;
      const merchant = str(l.merchant, 120);
      if (!merchant) errors.push(`Line ${n}: enter the merchant.`);
      else line.merchant = merchant;
      if (l.flag === "refund") line.flag = "refund";
      if (l.flag === "repay") {
        line.flag = "repay";
        const who = str(l.repayBy, 120);
        if (!who) errors.push(`Line ${n}: say who will repay it.`);
        else line.repayBy = who;
      }
    }
    lines.push(line);
  });

  const attestation = str(raw.attestationName, 120);
  if (!attestation) errors.push("Type your name to sign the request.");

  // A W-9 is needed only for labor (ticked, or charged to a labor sub-account), unless one is on file.
  let isLabor: boolean | undefined;
  let w9Required: boolean | undefined;
  let relatedParty: boolean | undefined;
  if (kind === "pay") {
    isLabor = Boolean(raw.isLabor) || lines.some((l) => isLaborAccount(findAccount(l.accountId)));
    const known = payee ? ctx.vendors.find((v) => v.name.toLowerCase() === payee!.toLowerCase()) : undefined;
    w9Required = isLabor && !known?.w9OnFile;
    if (w9Required && payee && !raw.w9Attached) errors.push("Upload the payee's W-9. IAR needs one on file before paying for labor.");
    relatedParty = Boolean(raw.relatedParty);
  }

  // Optional link to an event: only one of the events the form offered.
  const eventCardId = str(raw.eventCardId, 20) || undefined;
  if (eventCardId && (!/^EV-\d+$/.test(eventCardId) || (ctx.events && !ctx.events.includes(eventCardId)))) errors.push("Choose one of your events from the list, or leave the event blank.");

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    details: {
      kind,
      fund,
      description,
      payee,
      invoiceNumber: kind === "pay" ? str(raw.invoiceNumber, 60) || undefined : undefined,
      delivery,
      mailingAddress,
      isLabor,
      w9Required,
      relatedParty,
      card,
      lines,
      attestation: { name: attestation, at: "" },
      eventCardId,
    },
  };
}
