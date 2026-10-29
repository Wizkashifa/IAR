/** At a glance: what's waiting, the money, this week's events, tickets and turnaround. Run with `npm test`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventCard } from "./events/workflow";
import { daysText, eventTurnaround, eventsThisWeek, moneyThisMonth, paymentTurnaround, ticketHealth, waitingByKind } from "./overview";
import type { PurchaseCard } from "./purchases/workflow";
import type { StuckItem } from "./stuck";
import type { TicketCard } from "./tickets/workflow";

const NOW = new Date("2026-10-29T15:00:00Z");
const TODAY = "2026-10-29";

const po = (o: { id: string; kind?: string; fund?: string; amount: number; status?: string; stage?: string; paidAt?: string; createdAt?: string }) =>
  ({
    id: o.id,
    type: "purchase",
    status: o.status ?? "in_review",
    createdAt: o.createdAt ?? "2026-10-01T12:00:00Z",
    updatedAt: "2026-10-20T12:00:00Z",
    purchase: { kind: o.kind ?? "pay", fund: o.fund ?? "Youth Expenses", stage: o.stage ?? "chair", lines: [{ amount: o.amount }], payment: o.paidAt ? { method: "Check", reference: "1", at: o.paidAt, by: "f" } : undefined },
  }) as unknown as PurchaseCard;

const ev = (o: { id: string; status: string; dates: string[]; start?: string; approvedAt?: string; createdAt?: string }) =>
  ({
    id: o.id,
    type: "event",
    status: o.status,
    createdAt: o.createdAt ?? "2026-10-01T12:00:00Z",
    updatedAt: "2026-10-20T12:00:00Z",
    event: { dates: o.dates, start: o.start ?? "18:00", stage: o.approvedAt ? "approved" : "director", approvals: o.approvedAt ? [{ stage: "mission", by: "x", at: o.approvedAt }] : [] },
  }) as unknown as EventCard;

const tk = (o: { team: "it" | "facilities"; status: string; urgency?: string; assignee?: string; dueDate?: string }) =>
  ({ id: "TK", type: "ticket", status: "in_review", updatedAt: "", ticket: { team: o.team, status: o.status, urgency: o.urgency ?? "normal", assigneeEmail: o.assignee, dueDate: o.dueDate, statusSince: "2026-10-29T14:00:00Z" } }) as unknown as TicketCard;

test("what's waiting, by kind: count, over a week and the longest wait", () => {
  const item = (type: string, days: number) => ({ card: { type }, days }) as unknown as StuckItem;
  const w = waitingByKind([item("purchase", 2), item("purchase", 9), item("event", 12), item("ticket", 1)]);
  const p = w.find((k) => k.type === "purchase")!;
  assert.deepEqual([p.open, p.overWeek, p.oldestDays], [2, 1, 9]);
  assert.equal(w.find((k) => k.type === "event")!.overWeek, 1);
  assert.equal(w.find((k) => k.type === "marketing")!.open, 0);
});

test("money this month: paid this month by committee, waiting to pay, in review; card receipts and cancelled left out", () => {
  const m = moneyThisMonth(
    [
      po({ id: "a", amount: 100, status: "paid", stage: "books", paidAt: "2026-10-05T12:00:00Z" }),
      po({ id: "b", amount: 50.25, fund: "Education Expenses", status: "closed", stage: "done", paidAt: "2026-10-28T12:00:00Z" }),
      po({ id: "c", amount: 999, status: "closed", stage: "done", paidAt: "2026-09-30T12:00:00Z" }),
      po({ id: "d", amount: 80, status: "approved", stage: "payment" }),
      po({ id: "e", amount: 20 }),
      po({ id: "f", amount: 500, status: "cancelled" }),
      po({ id: "g", amount: 300, kind: "card", status: "in_review", stage: "finance" }),
    ],
    "2026-10",
  );
  assert.deepEqual([m.paid, m.paidCount, m.toPay, m.toPayCount, m.inReview, m.inReviewCount], [150.25, 2, 80, 1, 20, 1]);
  assert.deepEqual(m.byCommittee, [{ name: "Youth", total: 100 }, { name: "Education", total: 50.25 }]);
});

test("this week's events: approved or in review, on their first date in the next 7 days", () => {
  const w = eventsThisWeek(
    [
      ev({ id: "series", status: "approved", dates: ["2026-10-22", "2026-11-03", "2026-11-10"] }),
      ev({ id: "today", status: "in_review", dates: [TODAY], start: "19:00" }),
      ev({ id: "early", status: "approved", dates: [TODAY], start: "09:00" }),
      ev({ id: "later", status: "approved", dates: ["2026-11-05"] }),
      ev({ id: "denied", status: "denied", dates: ["2026-10-30"] }),
    ],
    TODAY,
  );
  assert.deepEqual(w.map((e) => [e.card.id, e.date, e.approved]), [["early", TODAY, true], ["today", TODAY, false], ["series", "2026-11-03", true]]);
});

test("ticket health per team: open, nobody on it, late and high or urgent", () => {
  const h = ticketHealth(
    [
      tk({ team: "facilities", status: "new", urgency: "urgent" }),
      tk({ team: "facilities", status: "in_progress", assignee: "a@x", dueDate: "2026-10-20" }),
      tk({ team: "facilities", status: "closed" }),
      tk({ team: "it", status: "assigned", assignee: "b@x" }),
    ],
    NOW,
    TODAY,
  );
  assert.deepEqual(h.find((t) => t.team === "facilities"), { team: "facilities", open: 2, nobody: 1, late: 1, urgent: 1 });
  assert.deepEqual(h.find((t) => t.team === "it"), { team: "it", open: 1, nobody: 0, late: 0, urgent: 0 });
});

test("turnaround: the median days from sending to paid, and to final approval, over the last 90 days", () => {
  const pay = paymentTurnaround(
    [
      po({ id: "a", amount: 1, createdAt: "2026-10-01T12:00:00Z", paidAt: "2026-10-03T12:00:00Z" }),
      po({ id: "b", amount: 1, createdAt: "2026-10-01T12:00:00Z", paidAt: "2026-10-05T12:00:00Z" }),
      po({ id: "c", amount: 1, createdAt: "2026-10-01T12:00:00Z", paidAt: "2026-10-11T12:00:00Z" }),
      po({ id: "old", amount: 1, createdAt: "2026-01-01T12:00:00Z", paidAt: "2026-02-01T12:00:00Z" }),
    ],
    NOW,
  );
  assert.deepEqual(pay, { days: 4, count: 3 });
  assert.equal(daysText(pay), "4 days");
  const evs = eventTurnaround([ev({ id: "a", status: "approved", dates: [], createdAt: "2026-10-01T12:00:00Z", approvedAt: "2026-10-01T18:00:00Z" })], NOW);
  assert.equal(daysText(evs), "Under a day");
  assert.equal(daysText(eventTurnaround([], NOW)), "Not enough yet");
});
