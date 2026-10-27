/** Reading the card statement, and what the card receipts form does with it. Run with `npm test`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cents, groupCharges, lineRows, linesFromItems, matchCards, merchantName, parseStatement, pastChoices, suggestAccounts, type StatementCharge } from "./statement";
import { SAMPLE_CARDS, samplePdf, sampleStatementLines, sampleStatementPages, type SampleCard } from "./statement-sample";
import { statementNotices } from "./notices";

const read = (lines: string[]) => {
  const r = parseStatement(lines);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.statement;
};

test("statement: every card, its charges and totals, filed under the month it closes", () => {
  const s = read(sampleStatementLines("2026-10"));
  assert.equal(s.month, "2026-10");
  assert.equal(s.closingDate, "2026-10-18");
  assert.equal(s.cycleStart, "2026-09-19");
  assert.equal(s.accountLast4, "0000");
  assert.deepEqual(s.cards.map((c) => c.last4), SAMPLE_CARDS.map((c) => c.last4));
  const vol = s.cards[0];
  assert.equal(vol.holderName, "SAMPLE VOLUNTEER");
  assert.equal(vol.charges.length, 7);
  assert.equal(vol.total, 547.6);
  assert.equal(s.total, 1039.39);
  // The organization's payment to Truist isn't a charge.
  assert.ok(!s.cards.flatMap((c) => c.charges).some((c) => c.description.includes("PAYMENTS")));
  // A credit; and a charge from before the cycle (posted in it) keeps its own date.
  assert.equal(vol.charges[6].amount, -23.18);
  assert.equal(s.cards[1].charges[0].date, "2026-09-27");
  assert.equal(s.cards[1].charges[0].postDate, "2026-10-01");
  // Cards continue on the next page under "Cardholder activity - continued".
  assert.equal(s.cards[3].last4, "9001");
});

test("statement: a cycle across the new year dates December charges in the year before", () => {
  const s = read(sampleStatementLines("2027-01"));
  assert.equal(s.closingDate, "2027-01-18");
  assert.equal(s.cycleStart, "2026-12-19");
  assert.equal(s.cards[1].charges[0].date, "2026-12-27");
  assert.equal(s.cards[0].charges[0].date, "2027-01-02");
});

test("statement: nothing is read if the totals don't add up or a row can't be read", () => {
  const off = parseStatement(sampleStatementLines("2026-10", undefined, { mangleTotal: true }));
  assert.ok(!off.ok && off.errors.some((e) => e.includes("the statement's total is")));

  const lines = sampleStatementLines("2026-10");
  const i = lines.findIndex((l) => l.startsWith("SAMPLE CHAIR"));
  const badTotal = [...lines];
  badTotal[i] = badTotal[i].replace(/Total: \$[\d,.]+/, "Total: $1.00");
  const r = parseStatement(badTotal);
  assert.ok(!r.ok && r.errors.some((e) => e.startsWith("The card ending in 4120: its charges add up to $370.64, but the statement says $1.00.")));

  const garbled = [...lines];
  garbled[i + 1] = garbled[i + 1].replace(/\$[\d,.]+$/, "two hundred");
  const g = parseStatement(garbled);
  assert.ok(!g.ok && g.errors.some((e) => e.startsWith("A charge couldn't be read")));

  const notAStatement = parseStatement(["Hello", "Some other PDF"]);
  assert.ok(!notAStatement.ok && notAStatement.errors[0].includes("doesn't look like an IAR card statement"));
});

test("statement: the same card twice, or the same reference twice, is refused", () => {
  const twice: SampleCard[] = [SAMPLE_CARDS[0], SAMPLE_CARDS[0]];
  const r = parseStatement(sampleStatementLines("2026-10", twice));
  assert.ok(!r.ok && r.errors.some((e) => e.includes("appears twice")));
});

test("statement: dollars to cents exactly", () => {
  assert.equal(cents("$1,234.56"), 123456);
  assert.equal(cents("-$87.46"), -8746);
  assert.equal(cents("$0.10") + cents("$0.20"), 30);
});

test("statement: PDF text is put back into lines, top of the page first, left to right", () => {
  const lines = linesFromItems([
    [
      { str: "$25.00", x: 520, y: 600.4 },
      { str: "09/23", x: 40, y: 600 },
      { str: "", x: 100, y: 600 },
      { str: "Billing cycle 09/19/26 - 10/18/26", x: 40, y: 760 },
    ],
    [{ str: "Page two", x: 40, y: 700 }],
  ]);
  assert.deepEqual(lines, ["Billing cycle 09/19/26 - 10/18/26", "09/23  $25.00", "Page two"]);
});

test("statement: the sample PDF reads back as the same statement", async () => {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(samplePdf(sampleStatementPages("2026-10")));
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(content.items.flatMap((i) => ("str" in i ? [{ str: i.str, x: i.transform[4] as number, y: i.transform[5] as number }] : [])));
  }
  const s = read(linesFromItems(pages));
  assert.deepEqual(s, read(sampleStatementLines("2026-10")));
});

test("cards: which are in Portal Settings, which aren't, and which had no charges", () => {
  const s = read(sampleStatementLines("2026-10"));
  const m = matchCards(s, [
    { last4: "2093", holderEmail: "volunteer@dev.local" },
    { last4: "4120", holderEmail: "chair@dev.local" },
    { last4: "1003", holderEmail: "finance@dev.local" },
    { last4: "7777", holderEmail: "quiet@dev.local" },
  ]);
  assert.deepEqual(m.matched.map((x) => x.card.last4), ["2093", "4120", "1003"]);
  assert.deepEqual(m.unknown.map((c) => c.last4), ["9001"]);
  assert.deepEqual(m.notOnStatement.map((c) => c.last4), ["7777"]);
});

test("statement notices: each cardholder with charges hears, with an alert and a link to their charges; not the uploader", () => {
  const s = read(sampleStatementLines("2026-10"));
  const n = statementNotices(s, [
    { last4: "2093", holderEmail: "volunteer@dev.local" },
    { last4: "1003", holderEmail: "finance@dev.local" },
    { last4: "7777", holderEmail: "quiet@dev.local" },
  ], "finance@dev.local");
  assert.equal(n.length, 1);
  assert.deepEqual(n[0].to, { email: "volunteer@dev.local" });
  assert.equal(n[0].alert, true);
  assert.equal(n[0].href, "/purchases/new?card=2093&month=2026-10");
  assert.equal(n[0].text, "Your October 2026 card statement is in: 7 charges on card ···2093, $547.60. Add the receipts and say why each was bought.");
});

test("merchants: a plain name for each charge", () => {
  const cases: [string, string][] = [
    ["AMAZON MKTPL*SAMPLE01X  Amzn.com/billWA", "Amazon"],
    ["Amazon.com*SAMPLE02X  Amzn.com/billWA", "Amazon"],
    ["AMAZON MKTPLACE PMTS  Amzn.com/billWA", "Amazon"],
    ["THE HOME DEPOT #0001  CARY  NC", "The Home Depot"],
    ["COSTCO WHSE #0002  APEX  NC", "Costco"],
    ["SQ *SAMPLE KITCHEN &  Raleigh NC", "Sample Kitchen"],
    ["TST* CARIBOU COFFEE - 999RALEIGH  NC", "Caribou Coffee"],
    ["SHELL OIL 12345678901  RALEIGH  NC", "Shell Oil"],
    ["CANVA* I00000-00000000  CANVA.COM TX", "Canva"],
    ["BT  *REVROBOTICS  1-800-5550100TX", "Revrobotics"],
    ["SITEONE LANDSCAPE SUPPLY,919-5550100 NC", "Siteone Landscape Supply"],
    ["Spectrum  800-555-0199 MO", "Spectrum"],
  ];
  for (const [d, name] of cases) assert.equal(merchantName(d), name, d);
});

const charge = (ref: string, description: string, amount: number): StatementCharge => ({ ref, date: "2026-10-01", postDate: "2026-10-02", description, amount });

test("groups: merchants with more than one charge; Amazon is lumped by default", () => {
  const g = groupCharges([
    charge("1", "AMAZON MKTPL*A  Amzn.com/billWA", 10),
    charge("2", "THE HOME DEPOT #0001  CARY  NC", 5),
    charge("3", "Amazon.com*B  Amzn.com/billWA", 20.05),
    charge("4", "AMAZON MKTPLACE PMTS  Amzn.com/billWA", -10),
    charge("5", "SAMPLE PRINT SHOP  RALEIGH  NC", 7),
    charge("6", "THE HOME DEPOT 0001  CARY  NC", 6),
  ]);
  assert.deepEqual(g, [
    { name: "Amazon", refs: ["1", "3", "4"], total: 20.05, lumpByDefault: true },
    { name: "The Home Depot", refs: ["2", "6"], total: 11, lumpByDefault: false },
  ]);
});

test("rows: a lumped merchant shows once, where its first charge is", () => {
  const rows = lineRows([{ id: "L1", group: "Amazon" }, { id: "L2" }, { id: "L3", group: "Amazon" }, { id: "L4" }]);
  assert.deepEqual(rows.map((r) => ("group" in r ? `${r.group}:${r.lines.map((l) => l.id).join("+")}` : r.line.id)), ["Amazon:L1+L3", "L2", "L4"]);
});

test("suggestions: this cardholder's last choice first, then IAR's most common; never a sub-account that's gone", () => {
  const past = pastChoices([
    { ownerEmail: "a@x.org", updatedAt: "2026-08-01", lines: [{ ref: "r1", merchant: "THE HOME DEPOT #0001  CARY  NC", accountId: "a17" }] },
    { ownerEmail: "a@x.org", updatedAt: "2026-09-01", lines: [{ ref: "r2", merchant: "THE HOME DEPOT 0001  CARY  NC", accountId: "a19" }] },
    { ownerEmail: "b@x.org", updatedAt: "2026-09-02", lines: [{ ref: "r3", merchant: "THE HOME DEPOT #0001  CARY  NC", accountId: "a20" }, { ref: "r4", merchant: "COSTCO WHSE #0002  APEX  NC", accountId: "a38" }] },
    { ownerEmail: "c@x.org", updatedAt: "2026-09-03", lines: [{ ref: "r5", merchant: "THE HOME DEPOT #0001  CARY  NC", accountId: "a20" }, { ref: "r6", merchant: "USPS.COM", accountId: "a-removed" }] },
    // Typed lines from before statements (no ref) aren't a choice for a statement charge.
    { ownerEmail: "a@x.org", updatedAt: "2026-09-04", lines: [{ merchant: "Costco", accountId: "a1" }] },
  ]);
  const charges = [charge("x1", "THE HOME DEPOT #0001  CARY  NC", 10), charge("x2", "COSTCO WHSE #0002  APEX  NC", 5), charge("x3", "USPS.COM CLICKNSHIP", 9.57), charge("x4", "NEW STORE", 1)];
  assert.deepEqual(suggestAccounts(past, "A@x.org", charges), { x1: "a19", x2: "a38" });
  assert.deepEqual(suggestAccounts(past, "z@x.org", charges), { x1: "a20", x2: "a38" });
});
