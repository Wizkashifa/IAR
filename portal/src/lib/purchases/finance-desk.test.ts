/** The finance desk's lists, filters and batch steps, and the QuickBooks CSV. Run with `npm test`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePurchaseInput, type PurchaseInput } from "./input";
import * as pw from "./workflow";
import { batchSummary, deskCards, deskDate, deskOptions, filterDesk, openReturns, payTypeOf, runBatch, splitKey, lineKey } from "./finance-desk";
import { QB_COLUMNS, csvCell, qbCsv, qbRows } from "./qb-csv";
import { TEST_UPLOADS, testCharges } from "./statement-sample";

const vol: pw.Actor = { email: "vol@x.org", name: "Vol Unteer", roles: ["member"] };
const chair: pw.Actor = { email: "chair@x.org", name: "Chair", roles: ["member", "chairs"] };
const fin: pw.Actor = { email: "fin@x.org", name: "Fin", roles: ["member", "finance"] };
const settings: pw.RoutingSettings = { approversFor: () => ({ chairs: [chair.email] }), executiveThreshold: 2500 };
const T = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 14)).toISOString();
let seq = 0;

/** Card receipts for card 2093 from a statement with these charges. */
function cardReceipts(month: string, charges: Parameters<typeof testCharges>[0]): pw.PurchaseCard {
  const t = testCharges(charges);
  return purchase({ kind: "card", fund: "", payee: undefined, delivery: undefined, paymentMethod: undefined, mailingAddress: undefined, cardLast4: "2093", statementMonth: month, lines: t.lines }, t.statement);
}

function purchase(over: Partial<PurchaseInput> = {}, statement?: ReturnType<typeof testCharges>["statement"]): pw.PurchaseCard {
  const input: PurchaseInput = {
    kind: "pay",
    fund: "Youth Expenses",
    description: "Youth night supplies",
    payee: "Known Vendor",
    paymentMethod: "check",
    delivery: "committee_box",
    mailingAddress: "1 Main St, Raleigh, NC 27601",
    lines: [{ accountId: "a38", amount: "120.50" }],
    attestationName: vol.name,
    ...over,
  };
  const r = parsePurchaseInput(input, { requesterName: vol.name, cards: [{ last4: "2093" }], vendors: [{ name: "Known Vendor", w9OnFile: true }], statement, uploads: TEST_UPLOADS, requesterEmail: vol.email });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const c = pw.newPurchase(r.details, vol.email, T(0));
  c.id = `PO-${++seq}`;
  return pw.submit(c, vol, settings, T(0));
}
/** Approved by the chair and finance: waiting to be paid. */
const toPay = (over: Partial<PurchaseInput> = {}) => pw.approve(pw.approve(purchase(over), chair, settings, T(1)), fin, settings, T(2));

test("desk tabs: to pay, to enter in QuickBooks, refunds owed; oldest first; sent-back requests stay off", () => {
  const a = toPay();
  const b = toPay({ fund: "Women Expenses", lines: [{ accountId: "a38", amount: "40" }] });
  const paid = pw.recordPayment(a, fin, T(3), "Check", "1042");
  const early = purchase();
  const back = pw.returnForChanges(toPay(), fin, T(3), "Wrong address");
  const all = [paid, b, early, back];
  assert.deepEqual(deskCards(all, "pay").map((c) => c.id), [b.id]);
  assert.deepEqual(deskCards(all, "books").map((c) => c.id), [paid.id]);
  assert.deepEqual(deskCards(all, "returns"), []);
});

test("desk filters: fund, month (paid date, statement month, or sent date) and payment type", () => {
  const check = toPay();
  // New requests are always checks; an older one sent by ACH still shows and filters as ACH.
  const older = toPay({ fund: "Women Expenses" });
  const ach = { ...older, purchase: { ...older.purchase, delivery: "ach" as const } };
  const card = cardReceipts("2026-08", [{ date: "2026-08-02", description: "USPS.COM CLICKNSHIP", amount: 9.57, line: { accountId: "a76" } }]);
  assert.equal(payTypeOf(check), "check");
  assert.equal(payTypeOf(ach), "ach");
  assert.equal(payTypeOf(card), "card");
  assert.equal(deskDate(card), "2026-08-01");
  assert.equal(deskDate(check), T(0).slice(0, 10));
  assert.equal(deskDate(pw.recordPayment(check, fin, T(9), "Check", "77")), T(9).slice(0, 10));

  const all = [check, ach, card];
  assert.deepEqual(filterDesk(all, { type: "ach" }).map((c) => c.id), [ach.id]);
  assert.deepEqual(filterDesk(all, { fund: "Youth Expenses" }).map((c) => c.id), [check.id]);
  assert.deepEqual(filterDesk(all, { month: "2026-08" }).map((c) => c.id), [card.id]);
  assert.deepEqual(filterDesk(all, {}).length, 3);
  assert.deepEqual(deskOptions(all), { funds: ["Imam's Office Fund Expenses", "Women Expenses", "Youth Expenses"], months: ["2026-10", "2026-08"] });
});

test("batch: each request goes through the workflow; refusals are listed with the workflow's reason and the rest still go", () => {
  const a = toPay();
  const b = toPay();
  const notYet = purchase();
  const r = runBatch([a, b, notYet], (c) => pw.recordPayment(c, fin, T(3), "Check", c.id === b.id ? "" : "1001"));
  assert.deepEqual(r.done.map((c) => [c.id, c.purchase.stage, c.purchase.payment?.reference]), [[a.id, "books", "1001"]]);
  assert.deepEqual(r.failed.map((f) => f.id), [b.id, notYet.id]);
  assert.match(r.failed[0].message, /check number or ACH reference/);
  // Only finance pays.
  assert.equal(runBatch([a], (c) => pw.recordPayment(c, vol, T(3), "Check", "1")).failed.length, 1);
  // QuickBooks after payment.
  const books = runBatch(r.done, (c) => pw.recordBooks(c, fin, T(4)));
  assert.equal(books.done[0].purchase.stage, "done");

  assert.equal(batchSummary(3, "marked paid", 0), "3 marked paid.");
  assert.equal(batchSummary(2, "marked paid", 1), "2 marked paid. 1 didn't go through; see below.");
  assert.equal(batchSummary(0, "marked paid", 2), "Nothing was changed. 2 didn't go through; see below.");
});

test("refunds owed: one entry per open line; keys carry the line", () => {
  const c = cardReceipts("2026-09", [
    { date: "2026-09-02", description: "USPS", amount: 9.57, line: { accountId: "a76", flag: "refund" } },
    { date: "2026-09-03", description: "TARGET 00012345  CARY  NC", amount: 4, line: { accountId: "a76" } },
  ]);
  const owed = openReturns([c]);
  assert.equal(owed.length, 1);
  assert.equal(owed[0].line.merchant, "USPS");
  assert.deepEqual(deskCards([c], "returns").map((x) => x.id), [c.id]);
  const key = lineKey(c.id, owed[0].line.id);
  assert.deepEqual(splitKey(key), { id: c.id, line: owed[0].line.id });
  assert.deepEqual(splitKey(c.id), { id: c.id });
});

test("QuickBooks CSV: one row per line item, plain columns, quoted where needed, no formulas", () => {
  const c = pw.recordPayment(toPay({ description: 'Snacks, "fresh"', lines: [{ accountId: "a38", amount: "120.5", note: "Pizza" }, { accountId: "a38", amount: "9" }] }), fin, T(3), "Check", "1042");
  const rows = qbRows([c]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].slice(1, 5), [c.id, "Pay a vendor or person", "Known Vendor", "Youth"]);
  assert.equal(rows[0][0], T(3).slice(0, 10));
  assert.equal(rows[0][7], 'Snacks, "fresh" · Pizza');
  assert.equal(rows[0][8], "120.50");
  assert.deepEqual(rows[0].slice(9), ["Check", "1042"]);

  const csv = qbCsv([c]);
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines[0], QB_COLUMNS.join(","));
  assert.match(lines[1], /"Snacks, ""fresh"" · Pizza"/);
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell(5), "5");
});

test("QuickBooks CSV: an aid request shows no payee or line notes; card rows use the charge date and merchant", () => {
  const sw = toPay({ fund: "Social & Welfare", payee: "A. Person", lines: [{ accountId: "a38", amount: "50", note: "Rent help for the family" }] });
  sw.purchase.restricted = true;
  const [row] = qbRows([sw]);
  assert.equal(row[3], "Restricted (see the request)");
  assert.equal(row[7], "Youth night supplies");
  assert.ok(!qbCsv([sw]).includes("A. Person"));

  const card = cardReceipts("2026-09", [
    { date: "2026-09-02", description: "USPS.COM CLICKNSHIP  800-555-0100 DC", amount: 9.57, line: { accountId: "a76", note: "Mailing certificates" } },
    { date: "2026-09-05", description: "AMAZON MKTPLACE PMTS  Amzn.com/billWA", amount: -12.3, line: { accountId: "a76" } },
    { date: "2026-09-06", description: "COSTCO WHSE #0002  APEX  NC", amount: 40, line: { accountId: "a38" } },
  ]);
  const [cr, credit, youth] = qbRows([card]);
  // Each card line is classed by its own sub-account's fund.
  assert.equal(cr[4], "Imam's Office");
  assert.equal(youth[4], "Youth");
  assert.equal(cr[0], "2026-09-02");
  assert.equal(cr[3], "IAR card ···2093 · USPS");
  assert.equal(cr[7], "Youth night supplies · Mailing certificates · USPS.COM CLICKNSHIP  800-555-0100 DC");
  assert.equal(cr[9], "IAR card");
  // A credit is a plain negative number, not text.
  assert.equal(credit[8], "-12.30");
  assert.ok(qbCsv([card]).includes(",-12.30,"));
});
