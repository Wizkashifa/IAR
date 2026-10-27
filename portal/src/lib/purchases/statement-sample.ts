/**
 * A made-up card statement in the same layout as IAR's Truist statement,
 * for tests and for trying the import in dev (/purchases/finance/statement
 * offers it as a download there). Names, card numbers, references and
 * amounts are all invented: a real statement never goes in this repo.
 */
import type { LineInput } from "./input";
import type { StatementCard } from "./statement";

export type SampleCharge = { day: number; post: number; desc: string; city?: string; amount: number };
export type SampleCard = { last4: string; holderName: string; charges: SampleCharge[] };

/** One printed line: its columns, each at an x position (points). */
export type SampleLine = [number, string][];

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Sample charges for the dev cards (lib/portal-settings.ts), plus one card
 * nobody holds in Portal Settings. Days are within the statement month,
 * or the end of the month before (0 and below).
 */
export const SAMPLE_CARDS: SampleCard[] = [
  {
    last4: "2093",
    holderName: "SAMPLE VOLUNTEER",
    charges: [
      { day: 2, post: 3, desc: "AMAZON MKTPL*SAMPLE001", city: "Amzn.com/billWA", amount: 40.71 },
      { day: 4, post: 5, desc: "USPS.COM CLICKNSHIP", city: "800-555-0100 DC", amount: 9.57 },
      { day: 6, post: 7, desc: "AMAZON MKTPL*SAMPLE002", city: "Amzn.com/billWA", amount: 23.18 },
      { day: 8, post: 9, desc: "SAMPLE PRINT SHOP", city: "RALEIGH NC", amount: 185.92 },
      { day: 9, post: 10, desc: "AMAZON MKTPL*SAMPLE003", city: "Amzn.com/billWA", amount: 61.4 },
      { day: 12, post: 13, desc: "SAMPLE CONFERENCE REG", city: "SAMPLE.ORG VA", amount: 250 },
      { day: 14, post: 16, desc: "AMAZON MKTPLACE PMTS", city: "Amzn.com/billWA", amount: -23.18 },
    ],
  },
  {
    last4: "4120",
    holderName: "SAMPLE CHAIR",
    charges: [
      { day: -1, post: 1, desc: "COSTCO WHSE #0001", city: "APEX NC", amount: 212.44 },
      { day: 10, post: 11, desc: "SQ *SAMPLE KITCHEN", city: "Raleigh NC", amount: 120 },
      { day: 19, post: 20, desc: "TARGET 00012345", city: "CARY NC", amount: 38.2 },
    ],
  },
  {
    last4: "1003",
    holderName: "SAMPLE FINANCE",
    charges: [{ day: 5, post: 6, desc: "SAMPLE JANITORIAL SUPPLY", city: "RALEIGH NC", amount: 96.15 }],
  },
  {
    last4: "9001",
    holderName: "SAMPLE FORMER HOLDER",
    charges: [{ day: 3, post: 4, desc: "SHELL OIL 12345678", city: "RALEIGH NC", amount: 25 }],
  },
];

/**
 * The statement closing on the 18th of `month` (YYYY-MM), as printed lines
 * with column positions, one array per page (cards split across two pages,
 * the second "continued", as the real one does).
 */
export function sampleStatementPages(month: string, cards: SampleCard[] = SAMPLE_CARDS, opts: { mangleTotal?: boolean } = {}): SampleLine[][] {
  const [y, m] = month.split("-").map(Number);
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const yy = (n: number) => pad(n % 100);
  const md = (day: number) => (day >= 1 ? `${pad(m)}/${pad(day)}` : `${pad(prev.m)}/${pad(28 + day)}`);
  const cycle = `Billing cycle ${pad(prev.m)}/19/${yy(prev.y)} - ${pad(m)}/18/${yy(y)}`;
  const totalOf = (c: SampleCard) => Math.round(c.charges.reduce((s, x) => s + x.amount, 0) * 100) / 100;
  const grand = Math.round(cards.reduce((s, c) => s + totalOf(c), 0) * 100) / 100 + (opts.mangleTotal ? 1 : 0);
  let seq = 1;
  const nextRef = () => `24${String(seq++).padStart(21, "0")}`;
  const head = (): SampleLine[] => [[[40, "SAMPLE ORGANIZATION"]], [[40, cycle]], [[40, "Business Direct Visa"], [420, "Account number ending in 0000"]]];
  const columns: SampleLine[] = [[[40, "Tran"], [80, "Post"], [120, "Reference"]], [[40, "date"], [80, "date"], [120, "number"], [260, "Transaction description"], [520, "Amount"]]];
  const cardLines = (c: SampleCard): SampleLine[] => [
    [[40, c.holderName], [260, "Account number ending in"], [380, c.last4], [480, `Total: ${money(totalOf(c))}`]],
    ...c.charges.map((x): SampleLine => [[40, md(x.day)], [80, md(x.post)], [120, nextRef()], [260, x.desc], ...(x.city ? ([[400, x.city]] as SampleLine) : []), [520, money(x.amount)]]),
  ];
  const half = Math.ceil(cards.length / 2);
  const page1: SampleLine[] = [
    ...head(),
    [[40, "Account summary"]],
    [[40, "Statement closing date"], [300, `${pad(m)}/18/${y}`]],
    [[40, "Organization account activity"]],
    ...columns,
    [[40, "SAMPLE ORGANIZATION"], [260, "Account number ending in 0000"], [480, "Total: -$1,000.00"]],
    [[40, `${md(10)}`], [80, md(10)], [120, "0626101300000000"], [260, "PAYMENTS - THANK YOU"], [520, "-$1,000.00"]],
    [[40, "Cardholder activity"], [300, `Total cardholder new activity: ${money(grand)}`]],
    ...columns,
    ...cards.slice(0, half).flatMap(cardLines),
  ];
  const page2: SampleLine[] = [...head(), [[40, "Cardholder activity - continued"]], ...columns, ...cards.slice(half).flatMap(cardLines), [[40, "Interest charge calculation"]], [[40, "PURCHASE"], [200, "14.90% (V)"], [480, "$0.00"]]];
  return [page1, page2];
}

/** The pages as plain text lines, columns two spaces apart (what the PDF reader gives). */
export function sampleStatementLines(month: string, cards?: SampleCard[], opts?: { mangleTotal?: boolean }): string[] {
  return sampleStatementPages(month, cards, opts).flatMap((p) => p.map((l) => l.map(([, t]) => t).join("  ")));
}

/** A small PDF of the pages: each column a separate piece of text, as on the real statement. */
export function samplePdf(pages: SampleLine[][]): Uint8Array {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) - 1 + 1;
  const catalog = add("<< /Type /Catalog /Pages 2 0 R >>");
  add("PAGES");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const lines of pages) {
    const ops = lines.flatMap((l, i) => l.map(([x, t]) => `BT /F1 8 Tf ${x} ${760 - i * 14} Td (${esc(t)}) Tj ET`)).join("\n");
    const content = add(`<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/**
 * For tests: a card's charges as an imported statement holds them, and a
 * request line for each (the sub-account and reason given, as the form sends).
 */
export function testCharges(charges: { date: string; description: string; amount: number; line: Partial<LineInput> }[], last4 = "2093"): { statement: StatementCard; lines: LineInput[] } {
  const withRefs = charges.map((c, i) => ({ ...c, ref: `T${last4}${String(i + 1).padStart(4, "0")}` }));
  return {
    statement: {
      last4,
      holderName: "TEST HOLDER",
      total: Math.round(charges.reduce((s, c) => s + c.amount, 0) * 100) / 100,
      charges: withRefs.map((c) => ({ ref: c.ref, date: c.date, postDate: c.date, description: c.description, amount: c.amount })),
    },
    lines: withRefs.map((c) => ({ ref: c.ref, accountId: "", amount: c.amount, note: "For the office", hasReceipt: true, ...c.line })),
  };
}
