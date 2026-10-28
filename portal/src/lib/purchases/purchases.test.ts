/**
 * Payments rules. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNTS, FUNDS, isLaborAccount } from "./accounts";
import { mergeVendors, vendorAfterPayment, vendorWithW9, vendorsForFund, visibleVendors } from "./vendors";
import type { Vendor } from "../cards";
import { fundsOf, mainFund, parseAmount, parsePurchaseInput, receiptsError, type PurchaseInput } from "./input";
import { checkComment, withComment } from "../comments";
import { purchaseCommentNotices, purchaseNotices, receiptsAddedNotices } from "./notices";
import { TEST_UPLOADS, testCharges } from "./statement-sample";
import * as wf from "./workflow";
import { WorkflowError } from "../workflow-core";

const volunteer: wf.Actor = { email: "vol@x.org", name: "Vol Unteer", roles: ["member"] };
const chair: wf.Actor = { email: "chair@x.org", name: "Chair", roles: ["member", "chairs"] };
const backup: wf.Actor = { email: "backup@x.org", name: "Backup", roles: ["member"] };
const finance: wf.Actor = { email: "fin@x.org", name: "Fin", roles: ["member", "finance"] };
const finance2: wf.Actor = { email: "fin2@x.org", name: "Fin Two", roles: ["member", "finance"] };
const office: wf.Actor = { email: "office@x.org", name: "Office", roles: ["member", "office"] };
const exec: wf.Actor = { email: "exec@x.org", name: "Exec", roles: ["member", "executive"] };
const sw: wf.Actor = { email: "sw@x.org", name: "SW", roles: ["member", "sw"] };
const admin: wf.Actor = { email: "admin@x.org", name: "Admin", roles: ["member", "admins"] };

const settings: wf.RoutingSettings = {
  approversFor: (fund) => (fund === "Women Expenses" ? {} : { chairs: [chair.email], backups: [backup.email] }),
  executiveThreshold: 2500,
};
const ctx = { requesterName: volunteer.name, requesterEmail: volunteer.email, uploads: TEST_UPLOADS, cards: [{ last4: "2093" }], vendors: [{ name: "Known Vendor", w9OnFile: true }, { name: "No W9 Co", w9OnFile: false }] };

const T = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 14)).toISOString();

function input(over: Partial<PurchaseInput> = {}): PurchaseInput {
  return {
    kind: "pay",
    fund: "Youth Expenses",
    description: "Youth night supplies",
    payee: "Known Vendor",
    delivery: "committee_box",
    mailingAddress: "1 Main St, Raleigh, NC 27601",
    lines: [{ accountId: "a38", amount: "120.50" }],
    attestationName: volunteer.name,
    ...over,
  };
}

function submitted(over: Partial<PurchaseInput> = {}, owner: wf.Actor = volunteer, ctxOver = {}): wf.PurchaseCard {
  const r = parsePurchaseInput(input(over), { ...ctx, requesterName: owner.name, ...ctxOver });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const c = wf.newPurchase(r.details, owner.email, T(0));
  c.id = "PO-1";
  return wf.submit(c, owner, settings, T(0));
}

test("chart of accounts: 24 funds, 97 sub-accounts, unique ids", () => {
  assert.equal(FUNDS.length, 24);
  assert.equal(ACCOUNTS.length, 97);
  assert.equal(new Set(ACCOUNTS.map((a) => a.id)).size, 97);
});

test("amounts: commas and dollar signs are fine; three decimals or zero are not", () => {
  assert.equal(parseAmount("$1,180.00"), 1180);
  assert.equal(parseAmount(90), 90);
  assert.ok(Number.isNaN(parseAmount("12.345")));
  assert.ok(Number.isNaN(parseAmount("abc")));
  const r = parsePurchaseInput(input({ lines: [{ accountId: "a38", amount: "0" }] }), ctx);
  assert.equal(r.ok, false);
});

test("input: every check needs an address, wherever it goes", () => {
  for (const delivery of ["mail", "committee_box", "office_pickup", "security"]) {
    assert.equal(parsePurchaseInput(input({ delivery, mailingAddress: "" }), ctx).ok, false, delivery);
    assert.equal(parsePurchaseInput(input({ kind: "reimburse", delivery, mailingAddress: "" }), ctx).ok, false, `reimburse ${delivery}`);
  }
});

const usps = () => testCharges([{ date: "2026-09-02", description: "USPS.COM CLICKNSHIP  800-555-0100 DC", amount: 9.57, line: { accountId: "a76" } }]);
const cardInput = (lines: PurchaseInput["lines"], over: Partial<PurchaseInput> = {}) => input({ kind: "card", cardLast4: "2093", statementMonth: "2026-09", lines, ...over });

test("card receipts: only once the statement is in, and only charges on it", () => {
  const notIn = parsePurchaseInput(cardInput(usps().lines), { ...ctx, statement: null });
  assert.ok(!notIn.ok && notIn.errors.some((e) => e.includes("isn't in yet")));
  const noCharges = parsePurchaseInput(cardInput([]), { ...ctx, statement: null, statementIn: true });
  assert.ok(!noCharges.ok && noCharges.errors.some((e) => e.includes("no charges")));
  const { statement, lines } = usps();
  const extra = parsePurchaseInput(cardInput([...lines, { ref: "MADE-UP", accountId: "a76", amount: "500", note: "x" }]), { ...ctx, statement });
  assert.ok(!extra.ok && extra.errors.some((e) => e.includes("aren't on the statement")));
  const missing = parsePurchaseInput(cardInput([]), { ...ctx, statement });
  assert.ok(!missing.ok && missing.errors.some((e) => e.includes("missing")));
});

test("card receipts: date, merchant and amount are the statement's, whatever the browser sent", () => {
  const { statement, lines } = usps();
  const r = parsePurchaseInput(cardInput([{ ...lines[0], amount: "1.00", date: "2026-01-01", merchant: "Something else" }]), { ...ctx, statement });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(
    { amount: r.details.lines[0].amount, date: r.details.lines[0].date, merchant: r.details.lines[0].merchant, ref: r.details.lines[0].ref },
    { amount: 9.57, date: "2026-09-02", merchant: "USPS.COM CLICKNSHIP  800-555-0100 DC", ref: statement.charges[0].ref },
  );
});

test("card receipts: every charge needs a sub-account and why it was bought", () => {
  const { statement, lines } = usps();
  const r = parsePurchaseInput(cardInput([{ ...lines[0], accountId: "", note: " " }]), { ...ctx, statement });
  assert.ok(!r.ok);
  if (r.ok) return;
  assert.ok(r.errors.some((e) => e === "09/02 USPS: choose a sub-account."));
  assert.ok(r.errors.some((e) => e === "09/02 USPS: say why it was bought."));
});

test("card receipts: a credit stays negative; lumped charges keep their group and can't be marked expected back", () => {
  const { statement, lines } = testCharges([
    { date: "2026-09-03", description: "AMAZON MKTPL*AB12  Amzn.com/billWA", amount: 40, line: { accountId: "a78", group: "Amazon" } },
    { date: "2026-09-09", description: "AMAZON MKTPLACE PMTS  Amzn.com/billWA", amount: -15.5, line: { accountId: "a78", group: "Amazon" } },
    { date: "2026-09-10", description: "SAMPLE STORE  RALEIGH  NC", amount: 20, line: { accountId: "a76", group: "Not the merchant" } },
  ]);
  const r = parsePurchaseInput(cardInput(lines), { ...ctx, statement });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.details.lines.map((l) => [l.amount, l.group]), [[40, "Amazon"], [-15.5, "Amazon"], [20, undefined]]);
  const flagged = parsePurchaseInput(cardInput([{ ...lines[0], flag: "refund" }, ...lines.slice(1)]), { ...ctx, statement });
  assert.ok(!flagged.ok && flagged.errors.some((e) => e.includes("split up the Amazon charges")));
});

test("input: requests are paid by check, so they say how the check goes; ACH isn't offered", () => {
  const noWhere = parsePurchaseInput(input({ paymentMethod: "check", delivery: "" }), ctx);
  assert.ok(!noWhere.ok && noWhere.errors.includes("Choose how we should send the check."));
  const ach = parsePurchaseInput(input({ delivery: "ach", mailingAddress: "" }), ctx);
  assert.ok(!ach.ok && ach.errors.includes("Choose how we should send the check."));
});

test("input: someone can only submit receipts for a card they hold; the request is filed under the fund its charges went to", () => {
  const { statement, lines } = usps();
  const notMine = parsePurchaseInput(cardInput(lines, { cardLast4: "9999" }), { ...ctx, statement });
  assert.equal(notMine.ok, false);
  // Whatever fund the browser sends, and even one this person isn't on: a card isn't tied to a committee.
  const mine = parsePurchaseInput(cardInput(lines, { fund: "Youth Expenses" }), { ...ctx, funds: ["Youth Expenses"], statement });
  assert.ok(mine.ok && mine.details.fund === "Imam's Office Fund Expenses");
});

test("card receipts: one card can pay for several committees; the main fund is where most of the money went", () => {
  const { statement, lines } = testCharges([
    { date: "2026-09-02", description: "COSTCO WHSE #0002  APEX  NC", amount: 90, line: { accountId: "a38" } },
    { date: "2026-09-03", description: "THE HOME DEPOT #0001  CARY  NC", amount: 120, line: { accountId: "a19" } },
    { date: "2026-09-04", description: "USPS.COM", amount: 9.57, line: { accountId: "a76" } },
  ]);
  const r = parsePurchaseInput(cardInput(lines), { ...ctx, funds: [], statement });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.details.fund, "Facility Maintenance Expenses");
  assert.deepEqual(fundsOf(r.details.lines), ["Facility Maintenance Expenses", "Youth Expenses", "Imam's Office Fund Expenses"]);
  assert.equal(mainFund([{ accountId: "a38", amount: 10 }, { accountId: "a19", amount: -30 }]), "Facility Maintenance Expenses", "a credit counts by its size");
  assert.equal(mainFund([{ accountId: "", amount: 10 }]), null);
});

test("receipts: every request needs at least one receipt or invoice, and lines never say they have none", () => {
  assert.equal(receiptsError(0, 0), "Attach the receipts or invoices. Every request needs at least one.");
  assert.equal(receiptsError(0, 1), null);
  assert.equal(receiptsError(2, 0), null, "files already on a request being edited count");
  const pay = parsePurchaseInput(input({ lines: [{ accountId: "a38", amount: "10", hasReceipt: false } as PurchaseInput["lines"][number]] }), ctx);
  assert.ok(pay.ok && pay.details.lines[0].hasReceipt === true);
  const { statement, lines } = usps();
  const card = parsePurchaseInput(cardInput([{ ...lines[0], hasReceipt: false } as PurchaseInput["lines"][number]]), { ...ctx, statement });
  assert.ok(card.ok && card.details.lines[0].hasReceipt === true);
});

test("labor sub-accounts: every temp labor, salary, payroll and honorarium line, nothing else", () => {
  const ids = ACCOUNTS.filter(isLaborAccount).map((a) => a.id);
  assert.deepEqual(ids, ["a1", "a13", "a16", "a25", "a32", "a36", "a37", "a40", "a43", "a47", "a51", "a74", "a81", "a86", "a93", "a97"]);
});

test("W-9: only for labor (ticked or a labor sub-account), unless one is on file", () => {
  const known = parsePurchaseInput(input({ isLabor: true }), ctx);
  assert.ok(known.ok && known.details.w9Required === false);
  const freshSupplies = parsePurchaseInput(input({ payee: "Brand New LLC" }), ctx);
  assert.ok(freshSupplies.ok && freshSupplies.details.w9Required === false);
  const repeatSupplies = parsePurchaseInput(input({ payee: "No W9 Co" }), ctx);
  assert.ok(repeatSupplies.ok && repeatSupplies.details.w9Required === false);

  const ticked = parsePurchaseInput(input({ payee: "No W9 Co", isLabor: true }), ctx);
  assert.ok(!ticked.ok && ticked.errors.some((e) => e.includes("Upload the payee's W-9")));
  const laborLine = parsePurchaseInput(input({ payee: "Brand New LLC", lines: [{ accountId: "a37", amount: "90" }] }), ctx);
  assert.ok(!laborLine.ok && laborLine.errors.some((e) => e.includes("W-9")));
  const withW9 = parsePurchaseInput(input({ payee: "Brand New LLC", lines: [{ accountId: "a37", amount: "90" }], w9Attached: true }), ctx);
  assert.ok(withW9.ok && withW9.details.w9Required === true && withW9.details.isLabor === true);
  const reimburse = parsePurchaseInput(input({ kind: "reimburse", lines: [{ accountId: "a37", amount: "90" }] }), ctx);
  assert.ok(reimburse.ok && reimburse.details.w9Required === undefined);
});

test("vendors: one shared list; Social & Welfare payees walled off", () => {
  const all: Vendor[] = [
    { id: "triangle-sound", name: "Triangle Sound", w9OnFile: true, funds: ["Youth Expenses"], timesPaid: 1 },
    { id: "sw-a-person", name: "A. Person", w9OnFile: false, restricted: true },
  ];
  assert.deepEqual(visibleVendors(all, volunteer.roles).restricted, []);
  assert.deepEqual(vendorsForFund(all, volunteer.roles, "Social & Welfare"), []);
  assert.equal(visibleVendors(all, ["member", "admins"]).restricted.length, 0);
  assert.equal(vendorsForFund(all, sw.roles, "Social & Welfare")[0].name, "A. Person");
  assert.equal(vendorsForFund(all, finance.roles, "Social & Welfare").length, 1);
  // Finance matching a Youth request never sees the S&W record.
  assert.deepEqual(vendorsForFund(all, finance.roles, "Youth Expenses").map((v) => v.name), ["Triangle Sound"]);

  // Events pays the vendor Youth used: one record, both funds, address from the check.
  const events = vendorAfterPayment(all, { kind: "pay", payee: "triangle sound", fund: "Event Committee Expenses", delivery: "mail", mailingAddress: "77 Capital Blvd" }, T(1))!;
  assert.equal(events.id, "triangle-sound");
  assert.deepEqual(events.funds, ["Youth Expenses", "Event Committee Expenses"]);
  assert.equal(events.timesPaid, 2);
  assert.equal(events.address, "77 Capital Blvd");

  // An S&W payee with a shared vendor's name gets its own restricted record.
  const aid = vendorAfterPayment(all, { kind: "pay", payee: "Triangle Sound", fund: "Social & Welfare", delivery: "ach" }, T(1))!;
  assert.equal(aid.id, "sw-triangle-sound");
  assert.equal(aid.restricted, true);
  assert.equal(aid.timesPaid, 1);
  assert.equal(vendorAfterPayment(all, { kind: "reimburse", payee: "Vol", fund: "Youth Expenses" }, T(1)), null);

  const w9 = vendorWithW9(all, { payee: "New Coach", fund: "Youth Expenses", w9Uploaded: { name: "w9.pdf", at: T(0), driveFileId: "f1" } }, T(2))!;
  assert.ok(w9.w9OnFile && w9.w9FileId === "f1" && !w9.restricted);
});

test("vendors: merging keeps the W-9 and adds up the history; never across the S&W wall", () => {
  const keep: Vendor = { id: "a", name: "Capital Plumbing", w9OnFile: false, funds: ["Facility Maintenance Expenses"], timesPaid: 2, lastPaidAt: T(1) };
  const drop: Vendor = { id: "b", name: "Capital Plumbing Co.", w9OnFile: true, w9Date: T(0), w9FileId: "f9", address: "88 Trade St", funds: ["Youth Expenses"], timesPaid: 1, lastPaidAt: T(5) };
  const m = mergeVendors(keep, drop);
  assert.equal(m.id, "a");
  assert.ok(m.w9OnFile && m.w9FileId === "f9");
  assert.equal(m.address, "88 Trade St");
  assert.equal(m.timesPaid, 3);
  assert.equal(m.lastPaidAt, T(5));
  assert.deepEqual(m.funds, ["Facility Maintenance Expenses", "Youth Expenses"]);
  assert.throws(() => mergeVendors(keep, { ...drop, restricted: true }));
});

test("a normal request goes chair → finance → payment → books → done", () => {
  let c = submitted();
  assert.equal(c.purchase.stage, "chair");
  assert.equal(c.purchase.approverEmail, chair.email);
  assert.equal(c.status, "in_review");
  c = wf.approve(c, chair, settings, T(1));
  assert.equal(c.purchase.stage, "finance");
  c = wf.approve(c, finance, settings, T(2));
  assert.equal(c.purchase.stage, "payment");
  assert.equal(c.status, "approved");
  c = wf.recordPayment(c, office, T(3), "Check", "20431");
  assert.equal(c.status, "paid");
  c = wf.recordBooks(c, finance, T(4));
  assert.equal(c.status, "closed");
  assert.equal(c.waitingOn, undefined);
  assert.deepEqual(c.purchase.history.map((h) => h.action), [
    "Submitted",
    "Approved (Chair approval)",
    "Approved (Finance review)",
    "Paid",
    "Entered in QuickBooks",
  ]);
});

test("nobody approves, pays or books their own request", () => {
  const c = submitted({}, finance);
  assert.equal(wf.permission(c, finance, "approve").ok, false);
  const atFinance = wf.approve(c, chair, settings, T(1));
  assert.throws(() => wf.approve(atFinance, finance, settings, T(2)), WorkflowError);
  const paid = wf.approve(atFinance, finance2, settings, T(2));
  assert.equal(wf.permission(paid, finance, "pay").ok, false);
});

test("a chair's own request goes to the vice chair, never skipped", () => {
  const c = submitted({}, chair);
  assert.equal(c.purchase.stage, "chair");
  assert.equal(c.purchase.approverEmail, backup.email);
  assert.equal(wf.permission(c, chair, "approve").ok, false);
  assert.equal(wf.permission(c, backup, "approve").ok, true);
});

test("only the named chair approves the chair step", () => {
  const c = submitted();
  const otherChair: wf.Actor = { email: "other.chair@x.org", name: "Other", roles: ["member", "chairs"] };
  assert.equal(wf.permission(c, otherChair, "approve").ok, false);
  assert.equal(wf.permission(c, finance, "approve").ok, false);
});

test("a fund with no chair on file goes straight to finance", () => {
  const c = submitted({ fund: "Women Expenses", lines: [{ accountId: ACCOUNTS.find((a) => a.fund === "Women Expenses")!.id, amount: "50" }] });
  assert.equal(c.purchase.stage, "finance");
});

test("at or above the threshold needs executive approval", () => {
  let c = submitted({ lines: [{ accountId: "a38", amount: "2000" }, { accountId: "a39", amount: "500" }] });
  c = wf.approve(c, chair, settings, T(1));
  c = wf.approve(c, finance, settings, T(2));
  assert.equal(c.purchase.stage, "executive");
  assert.equal(wf.permission(c, finance, "approve").ok, false);
  c = wf.approve(c, exec, settings, T(3));
  assert.equal(c.purchase.stage, "payment");
});

test("no executive step when the threshold isn't set", () => {
  let c = submitted({ lines: [{ accountId: "a38", amount: "9000" }] });
  const none = { ...settings, executiveThreshold: null };
  c = wf.approve(c, chair, none, T(1));
  c = wf.approve(c, finance, none, T(2));
  assert.equal(c.purchase.stage, "payment");
});

test("finance can't approve a payee that needs a W-9 until it's confirmed", () => {
  let c = submitted({ payee: "Brand New LLC", isLabor: true, w9Attached: true });
  c = wf.approve(c, chair, settings, T(1));
  assert.throws(() => wf.approve(c, finance, settings, T(2)), /W-9/);
  c = wf.approve(c, finance, settings, T(2), { w9Received: true });
  assert.equal(c.purchase.w9Required, false);
  assert.ok(c.purchase.history.some((h) => h.action === "Confirmed W-9 on file"));
});

test("send back to an earlier step: from finance to the chair, and from the pay step", () => {
  let c = submitted();
  assert.deepEqual(wf.returnTargets(c), ["requester"]);
  assert.throws(() => wf.returnForChanges(c, chair, T(1), "Fix it", "finance"), WorkflowError);
  c = wf.approve(c, chair, settings, T(1));
  assert.deepEqual(wf.returnTargets(c), ["requester", "chair"]);
  const before = c;
  c = wf.returnForChanges(c, finance, T(2), "Which event is this for?", "chair");
  assert.equal(c.purchase.stage, "chair");
  assert.equal(c.status, "in_review");
  assert.equal(c.purchase.approverEmail, chair.email);
  assert.equal(c.purchase.approvals.length, 0);
  assert.equal(c.waitingOn, `Chair approval: ${chair.email} (sent back: Which event is this for?)`);
  const notes = purchaseNotices(before, c, finance);
  assert.ok(notes.some((n) => "email" in n.to && n.to.email === chair.email && n.alert && n.text.includes("sent back")));
  assert.ok(notes.some((n) => "email" in n.to && n.to.email === volunteer.email && !n.alert));

  c = wf.approve(c, chair, settings, T(3));
  assert.equal(c.purchase.returnNote, undefined);
  c = wf.approve(c, finance, settings, T(4));
  assert.equal(c.purchase.stage, "payment");
  // The pay step: finance or the office can send it back; the requester can't.
  assert.equal(wf.permission(c, volunteer, "return").ok, false);
  assert.equal(wf.permission(c, chair, "return").ok, false);
  assert.deepEqual(wf.returnTargets(c), ["requester", "finance", "chair"]);
  const atFinance = wf.returnForChanges(c, office, T(5), "Invoice total doesn't match", "finance");
  assert.equal(atFinance.purchase.stage, "finance");
  assert.deepEqual(atFinance.purchase.approvals.map((a) => a.stage), ["chair"]);

  // After payment: send back from QuickBooks; history warns not to pay twice.
  c = wf.recordPayment(c, office, T(5), "Check", "20431");
  assert.equal(wf.permission(c, office, "return").ok, false);
  c = wf.returnForChanges(c, finance, T(6), "Wrong sub-account", "finance");
  assert.equal(c.purchase.stage, "finance");
  assert.ok(c.purchase.history.some((h) => h.action === "Payment already recorded" && h.note?.includes("20431")));
  c = wf.recordBooks(wf.recordPayment(wf.approve(c, finance, settings, T(7)), office, T(8), "Check", "20431"), finance, T(9));
  assert.equal(c.status, "closed");
  assert.equal(wf.permission(c, finance, "return").ok, false);
});

test("return needs a note; the requester edits and approval starts over", () => {
  let c = submitted();
  c = wf.approve(c, chair, settings, T(1));
  assert.throws(() => wf.returnForChanges(c, finance, T(2), " "), WorkflowError);
  c = wf.returnForChanges(c, finance, T(2), "Attach the receipt");
  assert.equal(c.status, "changes_requested");
  assert.equal(c.waitingOn, "You: Attach the receipt");
  assert.equal(wf.permission(c, finance, "approve").ok, false);
  c = wf.resubmit(c, { ...c.purchase, description: "Youth night supplies (receipt attached)" }, volunteer, settings, T(3));
  assert.equal(c.purchase.stage, "chair");
  assert.equal(c.purchase.approvals.length, 0);
  assert.equal(c.title, "Youth night supplies (receipt attached)");
});

test("card receipts: finance review only, then QuickBooks; refunds and repayments tracked until received", () => {
  const { statement, lines } = testCharges([
    { date: "2026-09-02", description: "SAMPLE BOOKS  LONDON", amount: 150, line: { accountId: "a76" } },
    { date: "2026-09-20", description: "SAMPLE CONFERENCE  VA", amount: 300, line: { accountId: "a75", flag: "repay", repayBy: "Da'wah Committee" } },
    { date: "2026-09-22", description: "SAMPLE HOTEL  NY", amount: 134.99, line: { accountId: "a75", flag: "refund" } },
  ]);
  const r = parsePurchaseInput(cardInput(lines), { ...ctx, statement });
  assert.ok(r.ok);
  if (!r.ok) return;
  let c = wf.submit(wf.newPurchase(r.details, volunteer.email, T(0)), volunteer, settings, T(0));
  assert.equal(c.purchase.stage, "finance");
  assert.equal(c.amount, 584.99);
  c = wf.approve(c, finance, settings, T(1));
  assert.equal(c.purchase.stage, "books");
  c = wf.recordBooks(c, finance, T(2));
  assert.equal(c.status, "closed");
  assert.match(c.waitingOn ?? "", /2 refund\/repayments outstanding/);
  assert.equal(wf.permission(c, chair, "resolve").ok, false);
  c = wf.resolveLine(c, finance, T(3), "L2");
  c = wf.resolveLine(c, finance, T(4), "L3");
  assert.equal(c.waitingOn, undefined);
  assert.throws(() => wf.resolveLine(c, finance, T(5), "L1"), WorkflowError);
});

test("Social & Welfare requests are restricted to S&W, finance and the people on the request", () => {
  const c = submitted({ fund: "Social & Welfare", payee: "Aid Recipient", lines: [{ accountId: "a55", amount: "950" }] });
  assert.equal(c.purchase.restricted, true);
  assert.equal(wf.canViewDetail(c, volunteer), true);
  assert.equal(wf.canViewDetail(c, chair), true); // the approver on it
  assert.equal(wf.canViewDetail(c, finance), true);
  assert.equal(wf.canViewDetail(c, sw), true);
  assert.equal(wf.canViewDetail(c, office), false);
  assert.equal(wf.canViewDetail(c, exec), false);
  assert.equal(wf.canViewDetail(c, { ...admin, seeAll: true }), false);
});

test("a portal admin can see but not approve or pay", () => {
  let c = submitted();
  c = wf.approve(c, chair, settings, T(1));
  assert.equal(wf.permission(c, admin, "approve").ok, false);
  assert.equal(wf.canViewDetail(submitted(), { ...admin, seeAll: true }), true);
});

test("the requester can cancel until it's approved for payment, not after", () => {
  let c = submitted();
  assert.equal(wf.permission(c, volunteer, "cancel").ok, true);
  assert.equal(wf.permission(c, chair, "cancel").ok, false);
  c = wf.approve(wf.approve(c, chair, settings, T(1)), finance, settings, T(2));
  assert.equal(wf.permission(c, volunteer, "cancel").ok, false);
});

test("queues: each person sees only what they can act on", () => {
  const a = submitted();
  const b = wf.approve(submitted(), chair, settings, T(1));
  assert.deepEqual(wf.actionableBy([a, b], chair).length, 1);
  assert.deepEqual(wf.actionableBy([a, b], finance).length, 1);
  assert.deepEqual(wf.actionableBy([a, b], volunteer).length, 0);
});

// ---- Out of office -----------------------------------------------------

test("someone covering an away chair can act on that chair's step, recorded on their behalf", () => {
  const c = submitted();
  const cover: wf.Actor = { ...backup, covering: [chair.email] };
  assert.equal(wf.permission(c, backup, "approve").ok, false);
  assert.equal(wf.permission(c, cover, "approve").ok, true);
  assert.equal(wf.canViewDetail(c, cover), true);
  const next = wf.approve(c, cover, settings, T(1));
  assert.equal(next.purchase.stage, "finance");
  assert.deepEqual(next.purchase.approvals[0], { stage: "chair", by: backup.email, at: T(1), onBehalfOf: chair.email });
  assert.equal(next.purchase.history.at(-1)?.action, `Approved (Chair approval) for ${chair.email}`);
  // Covering stops at the chair step: it doesn't make anyone a finance approver.
  assert.equal(wf.permission(next, cover, "approve").ok, false);
});

test("covering never lets someone approve their own request, or someone else's step", () => {
  const own = submitted({}, backup);
  assert.equal(wf.permission(own, { ...backup, covering: [chair.email] }, "approve").ok, false);
  const c = submitted();
  assert.equal(wf.permission(c, { ...volunteer, covering: ["someone.else@x.org"] }, "approve").ok, false);
});

// ---- Notifications -----------------------------------------------------

const to = (n: { to: { email: string } | { role: string } }) => ("email" in n.to ? n.to.email : `role:${n.to.role}`);

test("notices: each step emails whoever acts next; the requester hears when it comes back", () => {
  const c = submitted();
  const sub = purchaseNotices(null, c, volunteer);
  assert.deepEqual(sub.map((n) => [to(n), n.alert, n.delegable]), [[chair.email, true, true]]);
  assert.match(sub[0].text, /PO-1 .*needs your chair approval/);

  const atFinance = wf.approve(c, chair, settings, T(1));
  assert.deepEqual(purchaseNotices(c, atFinance, chair).map((n) => [to(n), n.alert]), [["role:finance", true]]);

  const toPay = wf.approve(atFinance, finance, settings, T(2));
  assert.deepEqual(purchaseNotices(atFinance, toPay, finance).map((n) => [to(n), n.alert]), [["role:finance", true], [volunteer.email, false]]);

  const paid = wf.recordPayment(toPay, office, T(3), "Check", "20431");
  const paidN = purchaseNotices(toPay, paid, office);
  assert.deepEqual(paidN.map((n) => [to(n), n.alert]), [["role:finance", false], [volunteer.email, false]]);
  assert.match(paidN[1].text, /paid \(Check 20431\)/);

  const back = wf.returnForChanges(c, chair, T(1), "Attach the invoice");
  const backN = purchaseNotices(c, back, chair);
  assert.deepEqual(backN.map((n) => [to(n), n.alert]), [[volunteer.email, true]]);
  assert.match(backN[0].text, /Attach the invoice/);
});

test("notices: nobody is notified about their own action, and S&W details stay out", () => {
  const own = submitted({}, chair);
  // The chair's own request goes to the backup, not back to the chair.
  assert.deepEqual(purchaseNotices(null, own, chair).map(to), [backup.email]);
  const sw = submitted({ fund: "Social & Welfare", lines: [{ accountId: findSwAccount(), amount: "300" }] });
  for (const n of purchaseNotices(null, sw, volunteer)) assert.doesNotMatch(n.text, /Youth night|\$300/);
});

function findSwAccount(): string {
  const a = ACCOUNTS.find((x) => x.fund === "Social & Welfare");
  if (!a) throw new Error("no S&W account");
  return a.id;
}

// ---- Oversight ------------------------------------------------------------

test("oversight alone: seeing a committee's requests doesn't let anyone act on them, and never opens S&W's", () => {
  const director: wf.Actor = { email: "dir@x.org", name: "Director", roles: ["member"], oversees: ["Youth Expenses", "Social & Welfare"] };
  const c = submitted();
  assert.equal(wf.canViewDetail(c, { ...volunteer, email: "other@x.org" }), false);
  assert.equal(wf.canViewDetail(c, director), true);
  assert.equal(wf.permission(c, director, "approve").ok, false);
  assert.equal(wf.canViewDetail(submitted({ fund: "Women Expenses" }), director), false);
  const sw = submitted({ fund: "Social & Welfare", lines: [{ accountId: findSwAccount(), amount: "300" }] });
  assert.equal(wf.canViewDetail(sw, director), false);
});

// ---- Directors -----------------------------------------------------------

const dir: wf.Actor = { email: "dir@x.org", name: "Director", roles: ["member"], oversees: ["Youth Expenses"], directs: ["Youth Expenses", "Social & Welfare"] };
const withDirector: wf.RoutingSettings = {
  approversFor: (fund) =>
    fund === "Women Expenses" ? { directors: [dir.email] } : { chairs: [chair.email], backups: fund === "Youth Expenses" ? [] : [backup.email], directors: [dir.email] },
  executiveThreshold: 2500,
};
function routed(over: Partial<PurchaseInput>, owner: wf.Actor): wf.PurchaseCard {
  const r = parsePurchaseInput(input(over), { ...ctx, requesterName: owner.name });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const c = wf.newPurchase(r.details, owner.email, T(0));
  c.id = "PO-2";
  return wf.submit(c, owner, withDirector, T(0));
}

test("directors: can take the chair step for their committee, recorded as director", () => {
  const c = routed({}, volunteer);
  assert.equal(c.purchase.approverEmail, chair.email);
  assert.equal(wf.permission(c, dir, "approve").ok, true);
  const next = wf.approve(c, dir, withDirector, T(1));
  assert.equal(next.purchase.stage, "finance");
  assert.deepEqual(next.purchase.approvals[0], { stage: "chair", by: dir.email, at: T(1), asDirector: true });
  assert.equal(next.purchase.history.at(-1)?.action, "Approved (Chair approval) as director");
  // Only the chair step: a director is not a finance approver.
  assert.equal(wf.permission(next, dir, "approve").ok, false);
  // Not for committees they don't direct.
  assert.equal(wf.permission(routed({ fund: "Education Expenses" }, volunteer), dir, "approve").ok, false);
});

test("directors: a fund with no chair, or a chair's own request with no vice chair, goes to the director", () => {
  const noChair = routed({ fund: "Women Expenses" }, volunteer);
  assert.equal(noChair.purchase.stage, "chair");
  assert.equal(noChair.purchase.approverEmail, dir.email);
  const chairsOwn = routed({}, chair);
  assert.equal(chairsOwn.purchase.approverEmail, dir.email);
  assert.match(chairsOwn.purchase.history[0].note ?? "", /director/);
});

test("directors: never their own request, never S&W", () => {
  const own = routed({}, dir);
  assert.equal(own.purchase.approverEmail, chair.email);
  assert.equal(wf.permission(own, dir, "approve").ok, false);
  const sw = routed({ fund: "Social & Welfare", lines: [{ accountId: findSwAccount(), amount: "300" }] }, volunteer);
  assert.equal(wf.permission(sw, dir, "approve").ok, false);
});

test("directors: told in the portal (no email) when a committee request waits on the chair", () => {
  const c = routed({}, volunteer);
  const ns = purchaseNotices(null, c, volunteer, { directors: [dir.email] });
  assert.deepEqual(ns.map((n) => [to(n), n.alert]), [[chair.email, true], [dir.email, false]]);
  // Routed to the director by name: one email, no duplicate notice.
  const noChair = routed({ fund: "Women Expenses" }, volunteer);
  assert.deepEqual(purchaseNotices(null, noChair, volunteer, { directors: [dir.email] }).map((n) => [to(n), n.alert]), [[dir.email, true]]);
});

// ---- Co-chairs and vice chairs --------------------------------------------

const coChair: wf.Actor = { email: "cochair@x.org", name: "Co-chair", roles: ["member", "chairs"], chairs: ["Education Expenses"] };
const chairA: wf.Actor = { ...chair, chairs: ["Education Expenses"] };
const coChairs: wf.RoutingSettings = {
  approversFor: (fund) => (fund === "Education Expenses" ? { chairs: [chair.email, coChair.email], backups: [backup.email] } : {}),
  executiveThreshold: null,
};
const eduLine = () => [{ accountId: ACCOUNTS.find((a) => a.fund === "Education Expenses")!.id, amount: "40" }];
function eduRequest(owner: wf.Actor): wf.PurchaseCard {
  const r = parsePurchaseInput(input({ fund: "Education Expenses", lines: eduLine() }), { ...ctx, requesterName: owner.name });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const c = wf.newPurchase(r.details, owner.email, T(0));
  c.id = "PO-3";
  return wf.submit(c, owner, coChairs, T(0));
}

test("co-chairs: one chair is named, and any other chair can act, recorded as co-chair", () => {
  const c = eduRequest(volunteer);
  assert.equal(c.purchase.approverEmail, chair.email);
  assert.equal(wf.permission(c, coChair, "approve").ok, true);
  const next = wf.approve(c, coChair, coChairs, T(1));
  assert.equal(next.purchase.history.at(-1)?.action, "Approved (Chair approval) as co-chair");
  // A chair of a different committee can't.
  assert.equal(wf.permission(c, { ...coChair, chairs: ["Youth Expenses"] }, "approve").ok, false);
});

test("co-chairs: a chair's own request goes to the other chair, and never back to themselves", () => {
  const c = eduRequest(chairA);
  assert.equal(c.purchase.approverEmail, coChair.email);
  assert.match(c.purchase.history[0].note ?? "", /another chair/);
  assert.equal(wf.permission(c, chairA, "approve").ok, false);
});

test("vice chairs: approve only when the chair can't (the chair's own request), not alongside the chair", () => {
  const solo: wf.RoutingSettings = { approversFor: () => ({ chairs: [chair.email], backups: [backup.email] }), executiveThreshold: null };
  const r = parsePurchaseInput(input({ fund: "Education Expenses", lines: eduLine() }), ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  const fromVolunteer = wf.submit({ ...wf.newPurchase(r.details, volunteer.email, T(0)), id: "PO-4" }, volunteer, solo, T(0));
  assert.equal(wf.permission(fromVolunteer, backup, "approve").ok, false);
  const fromChair = wf.submit({ ...wf.newPurchase(r.details, chair.email, T(0)), id: "PO-5" }, chair, solo, T(0));
  assert.equal(fromChair.purchase.approverEmail, backup.email);
  assert.match(fromChair.purchase.history[0].note ?? "", /vice chair/);
});

test("co-chairs: the named chair is emailed; the other chairs get a portal notice", () => {
  const c = eduRequest(volunteer);
  const ns = purchaseNotices(null, c, volunteer, { chairs: [chair.email, coChair.email] });
  assert.deepEqual(ns.map((n) => [to(n), n.alert]), [[chair.email, true], [coChair.email, false]]);
});

// ---- Comments ---------------------------------------------------------------

test("comments: must have text, under the limit; adding one bumps updatedAt and keeps the stage", () => {
  assert.equal(checkComment("  ").ok, false);
  assert.equal(checkComment("x".repeat(2001)).ok, false);
  assert.ok(checkComment(" Is the invoice attached? ").ok);
  const c = submitted();
  const next = withComment(c, { at: T(1), by: "Chair@x.org", name: "Chair", text: "Is the invoice attached?" });
  assert.equal(next.comments?.length, 1);
  assert.equal(next.comments?.[0].by, "chair@x.org");
  assert.equal(next.updatedAt, T(1));
  assert.equal(next.purchase.stage, c.purchase.stage);
});

test("comments: the requester, whoever it waits on and earlier commenters hear in the portal, never by email", () => {
  let c = submitted();
  c = withComment(c, { at: T(1), by: chair.email, name: chair.name, text: "Which event is this for?" });
  const fromChair = purchaseCommentNotices(c, chair, "Which event is this for?");
  assert.deepEqual(fromChair.map((n) => [to(n), n.alert]), [[volunteer.email, false]]);
  c = withComment(c, { at: T(2), by: volunteer.email, name: volunteer.name, text: "Family Night" });
  assert.deepEqual(purchaseCommentNotices(c, volunteer, "Family Night").map(to), [chair.email]);
  // At finance, the finance group hears too.
  const atFinance = withComment(wf.approve(submitted(), chair, settings, T(1)), { at: T(2), by: volunteer.email, name: volunteer.name, text: "Paid by check?" });
  assert.deepEqual(purchaseCommentNotices(atFinance, volunteer, "Paid by check?").map(to), ["role:finance"]);
});

test("comments: Social & Welfare comment notices never quote the comment", () => {
  const sw = submitted({ fund: "Social & Welfare", lines: [{ accountId: findSwAccount(), amount: "300" }] });
  const ns = purchaseCommentNotices(withComment(sw, { at: T(1), by: finance.email, name: finance.name, text: "Family name is…" }), finance, "Family name is…");
  assert.ok(ns.every((n) => !n.text.includes("Family name")));
});

test("more receipts: the requester adds them in several sends until the request is done; it stays where it is", () => {
  let c = submitted();
  const before = c.purchase.attachments.length;
  assert.equal(wf.permission(c, chair, "attach").ok, false, "only the requester");
  c = wf.addAttachments(c, volunteer, T(1), [{ name: "a.jpg", size: 1 }, { name: "b.jpg", size: 1 }]);
  c = wf.addAttachments(c, volunteer, T(2), [{ name: "c.pdf", size: 1 }]);
  assert.equal(c.purchase.attachments.length, before + 3);
  assert.equal(c.purchase.stage, "chair");
  assert.deepEqual(c.purchase.history.slice(-2).map((h) => [h.action, h.note]), [["Added 2 receipts", "a.jpg, b.jpg"], ["Added 1 receipt", "c.pdf"]]);
  assert.throws(() => wf.addAttachments(c, volunteer, T(3), []), WorkflowError);
  // Whoever it waits on hears in the portal, without an alert.
  const n = receiptsAddedNotices(c, volunteer, 1);
  assert.deepEqual(n.map((x) => [x.to, x.alert]), [[{ email: chair.email }, false]]);

  // At most MAX_ATTACHMENTS over all sends.
  const full = { ...c, purchase: { ...c.purchase, attachments: Array.from({ length: wf.MAX_ATTACHMENTS - 1 }, (_, i) => ({ name: `${i}.jpg`, size: 1 })) } };
  assert.throws(() => wf.addAttachments(full, volunteer, T(3), [{ name: "x", size: 1 }, { name: "y", size: 1 }]), WorkflowError);

  // Not once it's done, cancelled or declined.
  let done = wf.approve(c, chair, settings, T(4));
  done = wf.approve(done, finance, settings, T(5));
  done = wf.recordPayment(done, finance, T(6), "Check", "1");
  assert.equal(wf.permission(done, volunteer, "attach").ok, true, "still open at QuickBooks entry");
  done = wf.recordBooks(done, finance, T(7));
  assert.equal(wf.permission(done, volunteer, "attach").ok, false);
  assert.equal(wf.permission(wf.cancel(submitted(), volunteer, T(1)), volunteer, "attach").ok, false);
});

test("card receipts: every charge needs its receipt; a lumped group shares one; only the sender's own uploads, for this card and month", () => {
  const t = testCharges([
    { date: "2026-09-02", description: "AMAZON MKTPL*AB12  Amzn.com/billWA", amount: 40, line: { accountId: "a78", group: "Amazon" } },
    { date: "2026-09-09", description: "AMAZON MKTPL*CD34  Amzn.com/billWA", amount: 15, line: { accountId: "a78", group: "Amazon" } },
    { date: "2026-09-10", description: "COSTCO WHSE #0002  APEX  NC", amount: 20, line: { accountId: "a76" } },
  ]);
  const amazonReceipt = t.lines[0].receipts!;
  // The Amazon order history covers both Amazon charges; Costco has its own.
  const lines = [{ ...t.lines[0] }, { ...t.lines[1], receipts: amazonReceipt }, { ...t.lines[2] }];
  const ok = parsePurchaseInput(cardInput(lines), { ...ctx, statement: t.statement });
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.deepEqual(ok.receipts.map((a) => a.refs), [[t.statement.charges[0].ref, t.statement.charges[1].ref], [t.statement.charges[2].ref]]);

  // Costco without a receipt: refused, naming the charge.
  const missing = parsePurchaseInput(cardInput([lines[0], lines[1], { ...lines[2], receipts: [] }]), { ...ctx, statement: t.statement });
  assert.ok(!missing.ok && missing.errors.includes("09/10 Costco: add its receipt."));
  // A lumped group is covered by a receipt on any of its charges.
  const groupOnce = parsePurchaseInput(cardInput([lines[0], { ...lines[1], receipts: [] }, lines[2]]), { ...ctx, statement: t.statement });
  assert.ok(groupOnce.ok);

  // Someone else's upload, or one for another card or month, doesn't count.
  const theirs = testCharges([{ date: "2026-09-10", description: "COSTCO", amount: 20, line: {} }], "2093", "someone@x.org");
  const other = parsePurchaseInput(cardInput([lines[0], lines[1], { ...lines[2], receipts: theirs.lines[0].receipts }]), { ...ctx, statement: t.statement });
  assert.ok(!other.ok && other.errors.includes("A receipt couldn't be found. Add it again on its charge."));
  const wrongMonth = testCharges([{ date: "2026-08-10", description: "COSTCO", amount: 20, line: {} }]);
  const old = parsePurchaseInput(cardInput([lines[0], lines[1], { ...lines[2], receipts: wrongMonth.lines[0].receipts }]), { ...ctx, statement: t.statement });
  assert.equal(old.ok, false);

  // Editing a returned request: receipts already on it still count.
  const kept = parsePurchaseInput(cardInput([lines[0], lines[1], { ...lines[2], receipts: [] }]), { ...ctx, statement: t.statement, existingReceipts: [{ name: "costco.jpg", size: 1, refs: [t.statement.charges[2].ref] }] });
  assert.ok(kept.ok && kept.receipts.length === 1, "only the new Amazon upload is returned; the kept Costco one stays on the request");
  // A file on the request for no charge in particular (sent before receipts went on charges) covers them all.
  const older = parsePurchaseInput(cardInput(lines.map((l) => ({ ...l, receipts: [] }))), { ...ctx, statement: t.statement, existingReceipts: [{ name: "all-receipts.pdf", size: 1 }] });
  assert.ok(older.ok);

  // A credit is money coming back: its receipt isn't required.
  const credit = testCharges([
    { date: "2026-09-02", description: "COSTCO WHSE #0002  APEX  NC", amount: 20, line: { accountId: "a76" } },
    { date: "2026-09-05", description: "TARGET 00012345  CARY  NC", amount: -25, line: { accountId: "a76" } },
  ]);
  const noCreditReceipt = parsePurchaseInput(cardInput([credit.lines[0], { ...credit.lines[1], receipts: [] }]), { ...ctx, statement: credit.statement });
  assert.ok(noCreditReceipt.ok);
});
