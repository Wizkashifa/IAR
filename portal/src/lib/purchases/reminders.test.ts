/**
 * Purchase reminders, escalation and the morning digest. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { followUps, morningDigest } from "./reminders";
import type { PurchaseCard } from "./workflow";

const day = (n: number) => new Date(Date.UTC(2026, 9, 19 + n, 12)).toISOString(); // day(0) is a Monday
const card = (id: string, over: Partial<PurchaseCard["purchase"]> = {}, status: PurchaseCard["status"] = "in_review"): PurchaseCard =>
  ({
    id, orgId: "iar", type: "purchase", title: "Supplies", status, ownerEmail: "vol@x.org", committee: "Youth Expenses", updatedAt: day(0),
    purchase: { kind: "pay", fund: "Youth Expenses", description: "Supplies", lines: [{ id: "l1", accountId: "a1", amount: 25, hasReceipt: true }], attachments: [], stage: "chair", stageSince: day(0), approverEmail: "chair@x.org", approvals: [], restricted: false, attestation: { name: "Vol", at: day(0) }, history: [], ...over },
  }) as PurchaseCard;
const dirs = () => ["dir@x.org"];

test("reminders: once at 3 days to whoever it's waiting on, then the director at 5", () => {
  assert.equal(followUps([card("PO-1")], day(2), dirs).length, 0);
  const [r] = followUps([card("PO-1")], day(3), dirs);
  assert.equal(r.kind, "remind");
  assert.deepEqual(r.notices.map((n) => [n.to, n.alert]), [[{ email: "chair@x.org" }, true]]);
  assert.equal(followUps([r.card], day(4), dirs).length, 0, "only once");
  const [e] = followUps([r.card], day(5), dirs);
  assert.equal(e.kind, "escalate");
  assert.deepEqual(e.notices.map((n) => n.to), [{ email: "dir@x.org" }]);
  assert.equal(followUps([e.card], day(9), dirs).length, 0);
});

test("reminders: no director means finance hears; S&W requests never go to a director; finance's queue gets reminded too", () => {
  const [e] = followUps([card("PO-2")], day(6), () => []);
  assert.deepEqual(e.notices.map((n) => n.to), [{ role: "finance" }]);
  const [sw] = followUps([card("PO-3", { restricted: true })], day(6), dirs);
  assert.deepEqual(sw.notices.map((n) => n.to), [{ role: "finance" }]);
  assert.match(sw.notices[0].text, /Social & Welfare request/);
  const [fin] = followUps([card("PO-4", { stage: "finance", approverEmail: undefined })], day(3), dirs);
  assert.deepEqual(fin.notices.map((n) => n.to), [{ role: "finance" }]);
});

test("reminders: a new step starts the count again; QuickBooks entry and returned requests aren't chased", () => {
  const [r] = followUps([card("PO-5")], day(3), dirs);
  const moved = { ...r.card, purchase: { ...r.card.purchase, stage: "finance" as const, stageSince: day(3) } };
  assert.equal(followUps([moved], day(5), dirs).length, 0);
  assert.equal(followUps([moved], day(6), dirs)[0].kind, "remind");
  assert.equal(followUps([card("PO-6", { stage: "books" }, "paid")], day(9), dirs).length, 0);
  assert.equal(followUps([card("PO-7", {}, "changes_requested")], day(9), dirs).length, 0);
});

test("digest: one message per approver and one for finance, weekdays only", () => {
  const cards = [card("PO-1"), card("PO-2", { stageSince: day(-2) }), card("PO-3", { stage: "finance", approverEmail: undefined })];
  const d = morningDigest(cards, day(1));
  assert.deepEqual(d.map((n) => n.to), [{ email: "chair@x.org" }, { role: "finance" }]);
  assert.match(d[0].text, /2 purchase requests are waiting on you: PO-2 .*3 days; PO-1/);
  assert.equal(morningDigest(cards, day(5)).length, 0, "Saturday");
});
