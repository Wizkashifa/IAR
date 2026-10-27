/**
 * IAR's monthly credit card statement (Truist Business Visa): read it,
 * check it adds up, and turn each cardholder's charges into the lines of
 * their card receipts. Finance uploads the PDF once a month; each
 * cardholder then only adds the sub-account, why it was bought and the
 * receipts. Plain functions, tested in statement.test.ts; reading the PDF
 * itself is in statement-pdf.ts.
 *
 * The statement has one section per card ("NAME  Account number ending in
 * 0000  Total: $66.40") with a row per charge ("09/23 09/25 <reference>
 * <description> $25.00"; credits are "-$87.46"). Every section's total and
 * the statement's "Total cardholder new activity" must match the rows, or
 * nothing is imported.
 */
import { findAccount } from "./accounts";
import type { LineItem } from "./types";

/** One row on the statement. Amount in dollars, negative for a credit. */
export type StatementCharge = {
  /** Truist's reference number: unique on the statement, and how a request line points back to it. */
  ref: string;
  /** Transaction date, YYYY-MM-DD. */
  date: string;
  postDate: string;
  /** As printed, e.g. "AMAZON MKTPL*SAMPLE01X Amzn.com/billWA". */
  description: string;
  amount: number;
};

export type StatementCard = { last4: string; holderName: string; total: number; charges: StatementCharge[] };

export type Statement = {
  /** YYYY-MM-DD */
  closingDate: string;
  /** The month the statement closes in, YYYY-MM: what card receipts are filed under. */
  month: string;
  cycleStart: string;
  /** The organization's account (its last four digits, which every card hangs off). */
  accountLast4: string;
  cards: StatementCard[];
  /** Total cardholder new activity, dollars. */
  total: number;
};

export type ParsedStatement = { ok: true; statement: Statement } | { ok: false; errors: string[] };

const MONEY = String.raw`-?\$[\d,]+\.\d{2}`;
const CYCLE = /Billing\s+cycle\s+(\d{2})\/(\d{2})\/(\d{2})\s*-\s*(\d{2})\/(\d{2})\/(\d{2})/;
const ACCOUNT = /Account\s+number\s+ending\s+in\s+(\d{4})/;
const GRAND = new RegExp(`Total\\s+cardholder\\s+new\\s+activity:\\s*(${MONEY})`);
const HOLDER = new RegExp(`^(.+?)\\s+Account\\s+number\\s+ending\\s+in\\s+(\\d{4})\\s+Total:\\s*(${MONEY})$`);
const ROW = new RegExp(`^(\\d{2})/(\\d{2})\\s+(\\d{2})/(\\d{2})\\s+(\\d{8,})\\s+(.+?)\\s+(${MONEY})$`);

/** "-$1,234.56" → -123456 (cents, so totals add up exactly). */
export function cents(money: string): number {
  const neg = money.trim().startsWith("-");
  const n = Math.round(Number(money.replace(/[-$,\s]/g, "")) * 100);
  return neg ? -n : n;
}
const dollars = (c: number) => c / 100;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** The year of a MM/DD that falls on or before `ref` (YYYY-MM-DD) and within a year of it. */
function yearOf(month: number, day: number, ref: string): number {
  const [y, m, d] = ref.split("-").map(Number);
  return month > m || (month === m && day > d) ? y - 1 : y;
}

/**
 * Read a statement from its text, one printed line per entry (columns
 * separated by any run of spaces). Refuses the whole statement if anything
 * doesn't add up or a row can't be read: half a statement is worse than none.
 */
export function parseStatement(lines: string[]): ParsedStatement {
  const errors: string[] = [];
  let closingDate = "";
  let cycleStart = "";
  let accountLast4 = "";
  let grand: number | null = null;
  const cards: (StatementCard & { cents: number; printed: number })[] = [];
  let mode: "head" | "org" | "cards" | "end" = "head";
  let current: (typeof cards)[number] | null = null;

  for (const raw of lines) {
    // Columns are kept apart by two spaces, so a description's merchant stays separate from its city.
    const line = raw.replace(/\s{2,}/g, "  ").replace(/[^\S ]/g, " ").trim();
    if (!line) continue;
    const cycle = line.match(CYCLE);
    if (cycle && !closingDate) {
      const [, sm, sd, sy, em, ed, ey] = cycle.map(Number);
      cycleStart = iso(2000 + sy, sm, sd);
      closingDate = iso(2000 + ey, em, ed);
    }
    if (!accountLast4 && mode === "head") accountLast4 = line.match(ACCOUNT)?.[1] ?? "";
    if (/^Organization\s+account\s+activity\b/.test(line)) {
      mode = "org";
      continue;
    }
    if (/^Cardholder\s+activity\b/.test(line)) {
      mode = "cards";
      const g = line.match(GRAND);
      if (g && grand === null) grand = cents(g[1]);
      continue;
    }
    if (/^Interest\s+charge\s+calculation\b/.test(line)) {
      mode = "end";
      continue;
    }
    if (mode !== "cards") continue;

    const holder = line.match(HOLDER);
    if (holder) {
      if (cards.some((c) => c.last4 === holder[2])) {
        errors.push(`The card ending in ${holder[2]} appears twice on the statement.`);
        current = null;
        continue;
      }
      current = { last4: holder[2], holderName: holder[1].replace(/\s+/g, " ").trim(), total: dollars(cents(holder[3])), printed: cents(holder[3]), cents: 0, charges: [] };
      cards.push(current);
      continue;
    }
    const row = line.match(ROW);
    if (row) {
      if (!current) {
        errors.push(`A charge isn't under any card: “${line}”.`);
        continue;
      }
      if (!closingDate) {
        errors.push("The statement's billing cycle couldn't be found.");
        break;
      }
      const [, tm, td, pm, pd, ref, description, money] = row;
      const postDate = iso(yearOf(+pm, +pd, closingDate), +pm, +pd);
      const date = iso(yearOf(+tm, +td, postDate), +tm, +td);
      const amount = cents(money);
      current.cents += amount;
      current.charges.push({ ref, date, postDate, description: description.trim(), amount: dollars(amount) });
      continue;
    }
    // A line that starts like a charge but can't be read would silently drop money.
    if (/^\d{2}\/\d{2}\s/.test(line)) errors.push(`A charge couldn't be read: “${line}”.`);
  }

  if (!closingDate) errors.push("This doesn't look like an IAR card statement: its billing cycle couldn't be found.");
  if (grand === null) errors.push("The statement's “Total cardholder new activity” couldn't be found.");
  if (cards.length === 0) errors.push("No cardholder activity was found on the statement.");
  for (const c of cards) {
    if (c.cents !== c.printed) errors.push(`The card ending in ${c.last4}: its charges add up to ${fmt(c.cents)}, but the statement says ${fmt(c.printed)}.`);
  }
  const sum = cards.reduce((s, c) => s + c.cents, 0);
  if (grand !== null && cards.length && sum !== grand) errors.push(`The cards add up to ${fmt(sum)}, but the statement's total is ${fmt(grand)}.`);
  const refs = new Set<string>();
  for (const ch of cards.flatMap((c) => c.charges)) {
    if (refs.has(ch.ref)) errors.push(`Reference ${ch.ref} appears twice on the statement.`);
    refs.add(ch.ref);
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    statement: {
      closingDate,
      month: closingDate.slice(0, 7),
      cycleStart,
      accountLast4,
      cards: cards.map(({ cents: _c, printed: _p, ...c }) => c),
      total: dollars(grand!),
    },
  };
}

const fmt = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** A piece of text on a PDF page and where it sits (pdf.js text items). */
export type TextItem = { str: string; x: number; y: number };

/**
 * Put a page's text items back into printed lines: items within `tolerance`
 * points of the same height are one line, read left to right. Pages are
 * given top to bottom.
 */
export function linesFromItems(pages: TextItem[][], tolerance = 2): string[] {
  const out: string[] = [];
  for (const items of pages) {
    const rows: { y: number; items: TextItem[] }[] = [];
    for (const it of items) {
      if (!it.str.trim()) continue;
      const row = rows.find((r) => Math.abs(r.y - it.y) <= tolerance);
      if (row) row.items.push(it);
      else rows.push({ y: it.y, items: [it] });
    }
    // PDF heights grow upwards: the top of the page comes first.
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) out.push(r.items.sort((a, b) => a.x - b.x).map((i) => i.str.trim()).join("  "));
  }
  return out;
}

/** Which cards on the statement are in Portal Settings, and which aren't. */
export function matchCards<C extends { last4: string }>(s: Pick<Statement, "cards">, settingsCards: C[]) {
  return {
    matched: s.cards.flatMap((c) => {
      const card = settingsCards.find((x) => x.last4 === c.last4);
      return card ? [{ statement: c, card }] : [];
    }),
    unknown: s.cards.filter((c) => !settingsCards.some((x) => x.last4 === c.last4)),
    notOnStatement: settingsCards.filter((x) => !s.cards.some((c) => c.last4 === x.last4)),
  };
}

/** One card's charges on one imported statement, as the card receipts form gets them. */
export type StatementChoice = {
  month: string;
  last4: string;
  charges: StatementCharge[];
  /** ref → suggested sub-account. */
  suggested: Record<string, string>;
  /** Receipts already sent for this card and month (the request's ID). */
  sentAs?: string;
};

// ---- Merchants ------------------------------------------------------------

/** Merchants whose many small charges are worth lumping together by default. */
const BRANDS: [RegExp, string][] = [
  [/^(AMAZON|AMZN|Amazon\.com)/i, "Amazon"],
  [/HOME DEPOT/i, "The Home Depot"],
  [/^COSTCO/i, "Costco"],
  [/^LOWES/i, "Lowe's"],
  [/^USPS/i, "USPS"],
  [/^WAL-?MART|^WM SUPERCENTER/i, "Walmart"],
  [/^TARGET/i, "Target"],
  [/^BJS WHOLESALE/i, "BJ's Wholesale"],
  [/^ALDI/i, "Aldi"],
  [/^BESTBUY|^BEST BUY/i, "Best Buy"],
  [/^GRAINGER/i, "Grainger"],
  [/^STAPLES/i, "Staples"],
  [/^EBAY/i, "eBay"],
];
/** Lumped together unless the cardholder splits them. */
export const LUMP_BY_DEFAULT = new Set(["Amazon"]);

const PREFIX = /^(SQ \*|TST\* ?|SP |BT \*|FIV\*|PAYPAL \*|PY \*|DD \*|IN \*|SPI\*)/i;

/**
 * A plain name for a charge's description, used to show and group it:
 * "AMAZON MKTPL*SAMPLE01X  Amzn.com/billWA" → "Amazon", "SQ *SAMPLE
 * KITCHEN &  Raleigh  NC" → "Sample Kitchen". Only a display aid: the
 * statement's own words stay on the line.
 */
export function merchantName(description: string): string {
  const d = description.trim();
  for (const [re, name] of BRANDS) if (re.test(d)) return name;
  // The statement prints the merchant, then (after a column gap) where it is.
  let s = d.replace(/\s+\*/g, " *").split(/\s{2,}/)[0].replace(PREFIX, "");
  s = s.split("*")[0]; // "CANVA* I00000-00000000" → "CANVA"
  s = s.replace(/[\s,]+\d?-?\d{3}-\d{3,4}-?\d{0,4}.*$/, ""); // a phone number and what follows
  s = s.replace(/#\s?\d+/g, "").replace(/\s-\s.*$/, "").replace(/\b\d{3,}\b/g, "");
  s = s.replace(/[\s&,-]+$/, "").replace(/\s+/g, " ").trim();
  const name = s.split(" ").slice(0, 4).join(" ").toLowerCase().replace(/(^|[\s\-(/])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
  return name || d.replace(/\s+/g, " ");
}

export type ChargeGroup = { name: string; refs: string[]; total: number; lumpByDefault: boolean };

/** Merchants with more than one charge, in the order they first appear. */
export function groupCharges(charges: Pick<StatementCharge, "ref" | "description" | "amount">[]): ChargeGroup[] {
  const by = new Map<string, { refs: string[]; cents: number }>();
  for (const c of charges) {
    const name = merchantName(c.description);
    const g = by.get(name) ?? { refs: [], cents: 0 };
    g.refs.push(c.ref);
    g.cents += Math.round(c.amount * 100);
    by.set(name, g);
  }
  return [...by.entries()]
    .filter(([, g]) => g.refs.length > 1)
    .map(([name, g]) => ({ name, refs: g.refs, total: g.cents / 100, lumpByDefault: LUMP_BY_DEFAULT.has(name) }));
}

/**
 * A request's lines as shown: each lumped merchant once, where its first
 * charge is, with all its lines; every other line on its own.
 */
export function lineRows<L extends Pick<LineItem, "group">>(lines: L[]): ({ line: L } | { group: string; lines: L[] })[] {
  const out: ({ line: L } | { group: string; lines: L[] })[] = [];
  for (const l of lines) {
    if (!l.group) out.push({ line: l });
    else if (!out.some((r) => "group" in r && r.group === l.group)) out.push({ group: l.group, lines: lines.filter((x) => x.group === l.group) });
  }
  return out;
}

// ---- Suggestions ----------------------------------------------------------

/** A sub-account someone chose for a charge before: from past card receipts. */
export type PastChoice = { holderEmail: string; at: string; description: string; accountId: string };

/**
 * A sub-account to start each charge with: what this cardholder last chose
 * for the same merchant, otherwise what card holders chose most often for
 * it. Only sub-accounts still in the chart of accounts (it's still
 * changing), so a removed one is never suggested. ref → account id.
 */
export function suggestAccounts(past: PastChoice[], holderEmail: string, charges: Pick<StatementCharge, "ref" | "description">[]): Record<string, string> {
  const valid = past.filter((p) => p.accountId && findAccount(p.accountId));
  const mine = holderEmail.toLowerCase();
  const byMerchant = new Map<string, PastChoice[]>();
  for (const p of valid) {
    const k = merchantName(p.description);
    byMerchant.set(k, [...(byMerchant.get(k) ?? []), p]);
  }
  const out: Record<string, string> = {};
  for (const c of charges) {
    const seen = byMerchant.get(merchantName(c.description));
    if (!seen?.length) continue;
    const own = seen.filter((p) => p.holderEmail.toLowerCase() === mine).sort((a, b) => b.at.localeCompare(a.at))[0];
    if (own) {
      out[c.ref] = own.accountId;
      continue;
    }
    const counts = new Map<string, number>();
    for (const p of seen) counts.set(p.accountId, (counts.get(p.accountId) ?? 0) + 1);
    out[c.ref] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }
  return out;
}

/** Past choices from card receipt lines that came from a statement. */
export function pastChoices(requests: { ownerEmail: string; updatedAt: string; lines: Pick<LineItem, "ref" | "merchant" | "accountId">[] }[]): PastChoice[] {
  return requests.flatMap((r) => r.lines.filter((l) => l.ref && l.merchant).map((l) => ({ holderEmail: r.ownerEmail, at: r.updatedAt, description: l.merchant!, accountId: l.accountId })));
}
