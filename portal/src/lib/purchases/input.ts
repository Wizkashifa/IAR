/**
 * Turning what someone typed into the request form into PurchaseDetails, with
 * the checks the old form couldn't make. Plain functions, so they're tested
 * without a server (see purchases.test.ts).
 */
import { FUNDS, findAccount, isLaborAccount } from "./accounts";
import { merchantName, type StatementCard } from "./statement";
import {
  CHECK_DELIVERIES,
  type DeliveryMethod,
  type Attachment,
  type LineItem,
  type ReceiptUpload,
  type PurchaseDetails,
  type PurchaseKind,
} from "./types";

export type LineInput = {
  accountId: string;
  amount: string | number;
  note?: string;
  date?: string;
  merchant?: string;
  flag?: "" | "refund" | "repay";
  repayBy?: string;
  /** Card receipts: the statement charge this line is for. */
  ref?: string;
  /** Card receipts: lumped with the merchant's other charges under this name. */
  group?: string;
  /** Card receipts: the receipts uploaded for this charge (ReceiptUpload ids). */
  receipts?: string[];
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
  /** Cards this person holds (last four digits). A card isn't tied to a fund: each charge has its own sub-account. */
  cards: { last4: string }[];
  /** Saved vendors, to decide whether a W-9 is needed. */
  vendors: { name: string; w9OnFile: boolean }[];
  /** Funds this person may charge (their committees and teams'). Card receipts can charge any fund. Unset: any fund. */
  funds?: string[];
  /** Event cards (EV-…) this person may link the purchase to. Unset: any (sample data). */
  events?: string[];
  /**
   * Card receipts: the chosen card's charges on the imported statement for
   * the chosen month, loaded by the server. Null when that statement isn't
   * in, or the card has no charges on it (`statementIn` says which).
   */
  statement?: StatementCard | null;
  statementIn?: boolean;
  /** Card receipts: the uploads the lines name, loaded by the server (any that don't exist are simply missing). */
  uploads?: ReceiptUpload[];
  /** Card receipts being edited: the receipts already on the request. */
  existingReceipts?: Attachment[];
  /** Who is sending (card receipts: uploads must be theirs). */
  requesterEmail?: string;
};

/** `receipts`: card receipts' newly uploaded files, each with the charges it covers. */
export type ParseResult = { ok: true; details: Omit<PurchaseDetails, "stage" | "stageSince" | "approvals" | "history" | "restricted" | "attachments">; receipts: Attachment[] } | { ok: false; errors: string[] };

const KINDS: PurchaseKind[] = ["pay", "reimburse", "card"];
/** A card can have many charges in a month; other requests are split before this. */
const MAX_LINES = 60;
const MAX_CARD_LINES = 300;
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
    const month = str(raw.statementMonth, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) errors.push("Choose the statement month.");
    else if (held && !ctx.statement)
      errors.push(ctx.statementIn ? `Card ···${held.last4} has no charges on that month's statement, so there's nothing to send.` : `The statement for that month isn't in yet. The finance office uploads it each month.`);
    if (held) card = { last4: held.last4, statementMonth: month };
  }
  if (kind !== "card" && !FUNDS.includes(fund)) errors.push("Choose the fund or committee this is charged to.");
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
  const lines: LineItem[] = kind === "card" ? cardLines(rawLines, ctx.statement, errors) : otherLines(rawLines, errors);
  // Card receipts can be spread over several funds: the request is filed under the one most of the money went to.
  if (kind === "card") fund = mainFund(lines) ?? "";
  const receipts =
    kind === "card" && card && ctx.statement
      ? cardReceipts(rawLines, lines, ctx.uploads ?? [], { owner: ctx.requesterEmail ?? "", last4: card.last4, month: card.statementMonth }, ctx.existingReceipts ?? [], errors)
      : [];

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
    receipts,
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

/** Pay and reimburse: the lines as typed. */
function otherLines(rawLines: LineInput[], errors: string[]): LineItem[] {
  if (rawLines.length === 0) errors.push("Add at least one line.");
  if (rawLines.length > MAX_LINES) errors.push(`Split this into more than one request (${MAX_LINES} lines at most).`);
  return rawLines.slice(0, MAX_LINES).map((l, i) => {
    const n = i + 1;
    const account = findAccount(str(l.accountId, 20));
    if (!account) errors.push(`Line ${n}: choose a sub-account.`);
    const amount = parseAmount(l.amount);
    if (!(amount > 0) || amount > 1_000_000) errors.push(`Line ${n}: enter an amount over $0 with at most two decimals.`);
    // Every request carries its receipts or invoices (checked with the files), so every line has one.
    const line: LineItem = { id: `L${n}`, accountId: account?.id ?? "", amount: amount > 0 ? amount : 0, hasReceipt: true };
    const note = str(l.note, 200);
    if (note) line.note = note;
    return line;
  });
}

/**
 * Card receipts: one line per charge on the imported statement, in its
 * order. Date, merchant and amount come from the statement, whatever the
 * browser sent; the cardholder gives each charge its sub-account and why
 * it was bought, and says what's coming back.
 */
function cardLines(rawLines: LineInput[], statement: StatementCard | null | undefined, errors: string[]): LineItem[] {
  if (!statement) return [];
  if (statement.charges.length > MAX_CARD_LINES) {
    errors.push(`This card has more than ${MAX_CARD_LINES} charges this month. Ask the finance office to enter it.`);
    return [];
  }
  const byRef = new Map<string, LineInput>();
  for (const l of rawLines) {
    const ref = str(l.ref, 40);
    if (statement.charges.some((c) => c.ref === ref)) byRef.set(ref, l);
  }
  if (byRef.size < rawLines.length) errors.push("Some charges aren't on the statement. Reload the page and try again.");
  return statement.charges.map((c, i) => {
    const label = `${c.date.slice(5).replace("-", "/")} ${merchantName(c.description)}`;
    const l = byRef.get(c.ref);
    const line: LineItem = { id: `L${i + 1}`, accountId: "", amount: c.amount, date: c.date, merchant: c.description, ref: c.ref, hasReceipt: true };
    if (!l) {
      errors.push(`${label}: this charge is missing. Reload the page and try again.`);
      return line;
    }
    const account = findAccount(str(l.accountId, 20));
    if (!account) errors.push(`${label}: choose a sub-account.`);
    else line.accountId = account.id;
    const note = str(l.note, 200);
    if (!note) errors.push(`${label}: say why it was bought.`);
    else line.note = note;
    const group = str(l.group, 120);
    if (group && group === merchantName(c.description)) line.group = group;
    if (line.group && l.flag) errors.push(`${label}: split up the ${line.group} charges to mark one as expected back.`);
    else if (l.flag === "refund") line.flag = "refund";
    else if (l.flag === "repay") {
      line.flag = "repay";
      const who = str(l.repayBy, 120);
      if (!who) errors.push(`${label}: say who will repay it.`);
      else line.repayBy = who;
    }
    return line;
  });
}

/** The fund that most of the lines' money is charged to (by size, credits counting too), or null when no line has a sub-account. */
export function mainFund(lines: Pick<LineItem, "accountId" | "amount">[]): string | null {
  const by = new Map<string, number>();
  for (const l of lines) {
    const a = findAccount(l.accountId);
    if (a) by.set(a.fund, (by.get(a.fund) ?? 0) + Math.abs(l.amount));
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/** The funds a request's lines are charged to, the main one first. */
export function fundsOf(lines: Pick<LineItem, "accountId" | "amount">[]): string[] {
  const main = mainFund(lines);
  const all = [...new Set(lines.map((l) => findAccount(l.accountId)?.fund).filter((f): f is string => Boolean(f)))];
  return main ? [main, ...all.filter((f) => f !== main)] : all;
}

/** Every payment request needs at least one receipt or invoice: the files already on it plus any just added. */
export function receiptsError(existing: number, added: number): string | null {
  return existing + added > 0 ? null : "Attach the receipts or invoices. Every request needs at least one.";
}

/**
 * Card receipts: the receipt files for the charges, each with the charges
 * it covers. Every charge needs one (a lumped group shares its receipts),
 * counting receipts already on a request being edited. An upload that
 * isn't this person's, for this card and month, is refused.
 */
export function cardReceipts(rawLines: LineInput[], lines: LineItem[], uploads: ReceiptUpload[], who: { owner: string; last4: string; month: string }, existing: Attachment[], errors: string[]): Attachment[] {
  const covers = new Map<string, Set<string>>();
  let unknown = false;
  for (const l of rawLines) {
    const ref = str(l.ref, 40);
    if (!lines.some((x) => x.ref === ref)) continue;
    for (const raw of (Array.isArray(l.receipts) ? l.receipts : []).slice(0, 20)) {
      const id = str(raw, 60);
      const u = uploads.find((x) => x.id === id);
      if (!u || u.ownerEmail.toLowerCase() !== who.owner.toLowerCase() || u.last4 !== who.last4 || u.month !== who.month) {
        unknown = true;
        continue;
      }
      covers.set(id, (covers.get(id) ?? new Set()).add(ref));
    }
  }
  if (unknown) errors.push("A receipt couldn't be found. Add it again on its charge.");
  const covered = new Set([...[...covers.values()].flatMap((s) => [...s]), ...existing.flatMap((a) => a.refs ?? [])]);
  // A lumped group is covered when any of its charges is.
  for (const l of lines) if (l.group && lines.some((x) => x.group === l.group && covered.has(x.ref!))) covered.add(l.ref!);
  for (const l of lines) {
    if (!covered.has(l.ref!)) errors.push(`${l.date!.slice(5).replace("-", "/")} ${merchantName(l.merchant!)}: add its receipt.`);
  }
  return [...covers.entries()].map(([id, refs]) => ({ ...uploads.find((u) => u.id === id)!.attachment, refs: [...refs] }));
}
