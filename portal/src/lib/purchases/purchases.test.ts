/**
 * Purchase Requests rules. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNTS, FUNDS } from "./accounts";
import { parseAmount, parsePurchaseInput, type PurchaseInput } from "./input";
import { checkComment, withComment } from "../comments";
import { purchaseCommentNotices, purchaseNotices } from "./notices";
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
  approversFor: (fund) => (fund === "Women Expenses" ? {} : { chairs: [chair.email], backups: [backup.email] }),
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
  assert.deepEqual(sub.map((n) => [to(n), n.email, n.delegable]), [[chair.email, true, true]]);
  assert.match(sub[0].text, /PO-1 .*needs your chair approval/);

  const atFinance = wf.approve(c, chair, settings, T(1));
  assert.deepEqual(purchaseNotices(c, atFinance, chair).map((n) => [to(n), n.email]), [["role:finance", true]]);

  const toPay = wf.approve(atFinance, finance, settings, T(2));
  assert.deepEqual(purchaseNotices(atFinance, toPay, finance).map((n) => [to(n), n.email]), [["role:finance", true], [volunteer.email, false]]);

  const paid = wf.recordPayment(toPay, office, T(3), "Check", "20431");
  const paidN = purchaseNotices(toPay, paid, office);
  assert.deepEqual(paidN.map((n) => [to(n), n.email]), [["role:finance", false], [volunteer.email, false]]);
  assert.match(paidN[1].text, /paid \(Check 20431\)/);

  const back = wf.returnForChanges(c, chair, T(1), "Attach the invoice");
  const backN = purchaseNotices(c, back, chair);
  assert.deepEqual(backN.map((n) => [to(n), n.email]), [[volunteer.email, true]]);
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
  assert.deepEqual(ns.map((n) => [to(n), n.email]), [[chair.email, true], [dir.email, false]]);
  // Routed to the director by name: one email, no duplicate notice.
  const noChair = routed({ fund: "Women Expenses" }, volunteer);
  assert.deepEqual(purchaseNotices(null, noChair, volunteer, { directors: [dir.email] }).map((n) => [to(n), n.email]), [[dir.email, true]]);
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
  assert.deepEqual(ns.map((n) => [to(n), n.email]), [[chair.email, true], [coChair.email, false]]);
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
  assert.deepEqual(fromChair.map((n) => [to(n), n.email]), [[volunteer.email, false]]);
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
