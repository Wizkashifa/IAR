/**
 * Purchase Requests rules. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNTS, FUNDS } from "./accounts";
import { parseAmount, parsePurchaseInput, type PurchaseInput } from "./input";
import * as wf from "./workflow";

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
  approversFor: (fund) => (fund === "Women Expenses" ? {} : { chair: chair.email, backup: backup.email }),
  executiveThreshold: 2500,
};
const ctx = { requesterName: volunteer.name, cards: [{ last4: "2093", fund: "Imam's Office Fund Expenses" }], vendors: [{ name: "Known Vendor", w9OnFile: true }, { name: "No W9 Co", w9OnFile: false }] };

const T = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 14)).toISOString();

function input(over: Partial<PurchaseInput> = {}): PurchaseInput {
  return {
    kind: "pay",
    fund: "Youth Expenses",
    description: "Youth night supplies",
    payee: "Known Vendor",
    delivery: "committee_box",
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

test("input: a mailed check needs an address; card receipts need date and merchant per line", () => {
  const mail = parsePurchaseInput(input({ delivery: "mail", mailingAddress: "" }), ctx);
  assert.equal(mail.ok, false);
  const cardIn = parsePurchaseInput(input({ kind: "card", cardLast4: "2093", statementMonth: "2026-09", lines: [{ accountId: "a76", amount: "9.57" }] }), ctx);
  assert.equal(cardIn.ok, false);
  if (!cardIn.ok) assert.ok(cardIn.errors.some((e) => e.includes("charge date")));
});

test("input: someone can only submit receipts for a card they hold, and the fund follows the card", () => {
  const notMine = parsePurchaseInput(input({ kind: "card", cardLast4: "9999", statementMonth: "2026-09", lines: [{ accountId: "a76", amount: "9.57", date: "2026-09-02", merchant: "USPS" }] }), ctx);
  assert.equal(notMine.ok, false);
  const mine = parsePurchaseInput(input({ kind: "card", fund: "Youth Expenses", cardLast4: "2093", statementMonth: "2026-09", lines: [{ accountId: "a76", amount: "9.57", date: "2026-09-02", merchant: "USPS" }] }), ctx);
  assert.ok(mine.ok && mine.details.fund === "Imam's Office Fund Expenses");
});

test("W-9: needed for labor or a new payee, unless one is on file", () => {
  const known = parsePurchaseInput(input({ isLabor: true }), ctx);
  assert.ok(known.ok && known.details.w9Required === false);
  const fresh = parsePurchaseInput(input({ payee: "Brand New LLC" }), ctx);
  assert.ok(fresh.ok && fresh.details.w9Required === true);
  const labor = parsePurchaseInput(input({ payee: "No W9 Co", isLabor: true }), ctx);
  assert.ok(labor.ok && labor.details.w9Required === true);
  const repeatSupplies = parsePurchaseInput(input({ payee: "No W9 Co" }), ctx);
  assert.ok(repeatSupplies.ok && repeatSupplies.details.w9Required === false);
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
  assert.throws(() => wf.approve(atFinance, finance, settings, T(2)), wf.WorkflowError);
  const paid = wf.approve(atFinance, finance2, settings, T(2));
  assert.equal(wf.permission(paid, finance, "pay").ok, false);
});

test("a chair's own request goes to the backup approver, never skipped", () => {
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
  let c = submitted({ payee: "Brand New LLC", isLabor: true });
  c = wf.approve(c, chair, settings, T(1));
  assert.throws(() => wf.approve(c, finance, settings, T(2)), /W-9/);
  c = wf.approve(c, finance, settings, T(2), { w9Received: true });
  assert.equal(c.purchase.w9Required, false);
  assert.ok(c.purchase.history.some((h) => h.action === "Confirmed W-9 on file"));
});

test("return needs a note; the requester edits and approval starts over", () => {
  let c = submitted();
  c = wf.approve(c, chair, settings, T(1));
  assert.throws(() => wf.returnForChanges(c, finance, T(2), " "), wf.WorkflowError);
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
  const r = parsePurchaseInput(
    input({
      kind: "card",
      cardLast4: "2093",
      statementMonth: "2026-09",
      lines: [
        { accountId: "a76", amount: "150", date: "2026-09-02", merchant: "Baian" },
        { accountId: "a75", amount: "300", date: "2026-09-20", merchant: "AMJA", flag: "repay", repayBy: "Da'wah Committee" },
        { accountId: "a75", amount: "134.99", date: "2026-09-22", merchant: "Priceline", flag: "refund", hasReceipt: false },
      ],
    }),
    ctx,
  );
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
  assert.throws(() => wf.resolveLine(c, finance, T(5), "L1"), wf.WorkflowError);
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
