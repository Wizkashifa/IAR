/**
 * "Request this again": what's copied, what's reset, who may copy. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Card } from "./cards";
import type { EventDetails } from "./events/types";
import type { MarketingDetails } from "./marketing/types";
import type { PurchaseDetails } from "./purchases/types";
import { canRequestAgain, copiedNote, eventAgain, marketingAgain, purchaseAgain, suggestDate } from "./again";

const today = "2026-10-25"; // a Sunday
const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

test("suggested date: same weekday; a year on for an old event, at least three weeks out for a recent one", () => {
  // Last month's Monday event: the first Monday at least three weeks out.
  const recent = suggestDate("2026-10-19", today);
  assert.equal(weekday(recent), weekday("2026-10-19"));
  assert.ok(recent >= "2026-11-15" && recent < "2026-11-22", recent);
  // Last November's Saturday dinner: the same Saturday this year, 52 weeks on.
  const yearly = suggestDate("2025-11-29", today);
  assert.equal(yearly, "2026-11-28");
  assert.equal(weekday(yearly), weekday("2025-11-29"));
  // Two years back, and this year's date already gone: on to next year.
  const old = suggestDate("2024-10-26", today);
  assert.equal(weekday(old), weekday("2024-10-26"));
  assert.ok(old >= "2026-11-08", old);
  assert.equal(suggestDate("", today), "2026-11-15");
});

const event = {
  title: "Youth Movie Night",
  description: "A film and pizza",
  committeeGroup: "portal-team-youth@x.org",
  committeeName: "Youth",
  date: "2026-10-19",
  start: "18:30",
  end: "21:00",
  setup: 30,
  teardown: 30,
  recur: { freq: "weekly", until: "2026-12-21" },
  rooms: ["mphA"],
  attendance: 45,
  budget: 300,
  food: true,
  isPublic: true,
  registration: false,
  av: true,
  setupNotes: "Rows of chairs",
  newProgram: true,
  outsideSpeaker: false,
  fundraiser: false,
  brief: { subtitle: "Family film", text: "Join us", flyer: "", regLink: "", payment: "", files: "https://drive.google.com/old", final: true },
  avNeeds: { kinds: ["projector"], includes: ["video"], ack: true },
  teamNotes: "",
  stage: "done",
  history: [{ at: "x", by: "y", action: "Submitted" }],
} as unknown as EventDetails;

test("an event again: what the requester said, a new date, and nothing from the old request's life", () => {
  const e = eventAgain(event, today);
  assert.equal(e.title, "Youth Movie Night");
  assert.deepEqual(e.rooms, ["mphA"]);
  assert.equal(e.attendance, 45);
  assert.equal(e.date >= "2026-11-15", true);
  assert.deepEqual(e.recur, { freq: "weekly", until: "" });
  assert.equal(e.newProgram, false, "it isn't new any more");
  assert.equal(e.brief?.subtitle, "Family film");
  assert.equal(e.brief?.files, undefined, "the old Drive link isn't asked for any more");
  assert.equal(e.brief?.final, false);
  assert.equal(e.avNeeds?.ack, false);
  assert.deepEqual(e.avNeeds?.kinds, ["projector"]);
  assert.equal("history" in e, false);
  assert.equal("stage" in e, false);
});

const purchase = {
  kind: "reimburse",
  fund: "Youth Expenses",
  description: "Monthly snacks",
  payee: "Sample Chair",
  invoiceNumber: "INV-9",
  delivery: "box",
  mailingAddress: "1 Main St",
  card: { last4: "4120", statementMonth: "2026-09" },
  lines: [{ id: "l1", accountId: "56000", amount: 184.5, note: "Snacks", date: "2026-09-03", merchant: "Costco", hasReceipt: false, flag: "refund", repayBy: "Ali" }],
  attachments: [{ name: "receipt.pdf" }],
  stage: "done",
  approvals: [{ stage: "chair" }],
  attestation: { name: "Sample Chair", at: "x" },
  eventCardId: "EV-1105",
  history: [],
} as unknown as PurchaseDetails;

test("a purchase again: payee, fund and lines with amounts; no receipts, invoice, month, event or signature", () => {
  const p = purchaseAgain(purchase);
  assert.equal(p.payee, undefined, "a reimbursement pays whoever asks this time");
  assert.equal(purchaseAgain({ ...purchase, kind: "pay", payee: "Triangle Sound" } as PurchaseDetails).payee, "Triangle Sound");
  assert.equal(p.fund, "Youth Expenses");
  assert.deepEqual(p.lines, [{ accountId: "56000", amount: "184.50", note: "Snacks", date: "", merchant: "Costco", hasReceipt: true, flag: "", repayBy: "" }]);
  assert.equal(p.invoiceNumber, undefined);
  assert.equal(p.statementMonth, undefined);
  assert.equal(p.eventCardId, undefined);
  assert.equal(p.attestationName, "");
  assert.equal(p.cardLast4, undefined);
});

test("marketing again: same type and answers, dates already gone left empty", () => {
  const m = { kind: "graphic", answers: { desc: "A certificate", due: "2026-09-01" }, driveLink: "https://drive.google.com/x", notes: "Gold border", stage: "done" } as unknown as MarketingDetails;
  const out = marketingAgain(m, "Youth", today);
  assert.equal(out.kind, "graphic");
  assert.equal(out.committee, "Youth");
  assert.equal(out.answers.desc, "A certificate");
  assert.equal(out.driveLink, "https://drive.google.com/x");
  assert.equal(out.answers.due, "", "the due date has passed");
  assert.equal(marketingAgain({ ...m, answers: { ...m.answers, due: "2026-12-01" } }, "Youth", today).answers.due, "2026-12-01");
  assert.equal(copiedNote("MK-1"), "Copied from MK-1. Check the dates and details before sending.");
});

const card = (over: Partial<Card>): Card => ({ id: "X-1", orgId: "o", type: "event", title: "t", status: "closed", ownerEmail: "vol@x.org", committee: "Youth", updatedAt: "x", event: event, ...over }) as Card;

test("who may request again: the requester, or the committee's chair or vice chair, once it's over", () => {
  const vol = { email: "vol@x.org", teams: [] };
  const chair = { email: "chair@x.org", teams: [{ group: "portal-team-youth@x.org", name: "Youth", role: "chair" }] };
  const member = { email: "m@x.org", teams: [{ group: "portal-team-youth@x.org", name: "Youth", role: "member" }] };
  assert.equal(canRequestAgain(card({}), vol, today), true);
  assert.equal(canRequestAgain(card({}), chair, today), true);
  assert.equal(canRequestAgain(card({}), member, today), false);
  // Not over yet: an approved event still ahead.
  assert.equal(canRequestAgain(card({ status: "approved", event: { ...event, date: "2026-12-01", recur: undefined } as EventDetails }), vol, today), false);
  // Approved and already happened counts as over.
  assert.equal(canRequestAgain(card({ status: "approved", event: { ...event, recur: undefined } as EventDetails }), vol, today), true);
  // Purchases go by the committee's name; tickets aren't copied.
  assert.equal(canRequestAgain(card({ type: "purchase", status: "paid", event: undefined, purchase }), chair, today), true);
  // Card receipts come from each month's statement, so they're never copied.
  assert.equal(canRequestAgain(card({ type: "purchase", status: "closed", event: undefined, purchase: { ...purchase, kind: "card" } }), vol, today), false);
  assert.equal(canRequestAgain(card({ type: "ticket", event: undefined }), vol, today), false);
});
