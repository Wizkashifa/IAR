/**
 * Portal measures: the range looked at, requests per week or month, time at
 * each step, sent back, forms started but not sent, feedback by kind. Run with
 * `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { feedbackByKind, fmtWait, median, periodsFor, rangeOf, requestsPer, requestsPerWeek, sentBack, sentSince, startedVsSent, stepOf, stepTimes, type MeasureCard } from "./measures";
import { parsePurchaseInput } from "./purchases/input";
import * as pw from "./purchases/workflow";

const H = 3_600_000;
const DAY = 24 * H;
const T0 = Date.UTC(2026, 9, 1, 14);
const at = (hours: number) => new Date(T0 + hours * H).toISOString();
const card = (type: MeasureCard["type"], history: [number, string][], createdHours = history[0]?.[0] ?? 0): MeasureCard => ({
  type,
  createdAt: at(createdHours),
  updatedAt: at(history[history.length - 1]?.[0] ?? createdHours),
  history: history.map(([h, action]) => ({ at: at(h), action })),
});

test("requests per week: the last six weeks, newest last, by kind", () => {
  const now = new Date(T0 + 50 * DAY);
  const cards = [
    card("purchase", [[50 * 24 - 1, "Submitted"]]), // this week
    card("event", [[50 * 24 - 10 * 24, "Submitted for Sat, Nov 7"]]), // two weeks ago
    card("ticket", [[50 * 24 - 2, "Reported to the Facilities team"]]),
    card("purchase", [[0, "Submitted"]]), // seven weeks ago: left out
  ];
  const w = requestsPerWeek(cards, now);
  assert.equal(w.length, 6);
  assert.deepEqual(w[5].counts, { event: 0, purchase: 1, marketing: 0, ticket: 1 });
  assert.deepEqual(w[4].counts, { event: 1, purchase: 0, marketing: 0, ticket: 0 });
  assert.equal(w.reduce((a, x) => a + x.counts.purchase, 0), 1);
  assert.ok(w[0].weekStart < w[5].weekStart);
});

test("ranges: 6 weeks by default, 13 weeks for 3 months, calendar months for 12 months", () => {
  assert.equal(rangeOf(undefined), "6w");
  assert.equal(rangeOf("nonsense"), "6w");
  const now = new Date(Date.UTC(2026, 9, 26, 15));
  const six = periodsFor("6w", now);
  assert.equal(six.by, "week");
  assert.equal(six.periods.length, 6);
  assert.equal(six.periods[5].end, now.getTime());
  assert.equal(six.start, now.getTime() - 42 * DAY);
  const three = periodsFor("3m", now);
  assert.equal(three.periods.length, 13);
  const year = periodsFor("12m", now);
  assert.equal(year.by, "month");
  assert.deepEqual([year.periods[0].day, year.periods[11].day], ["2025-11-01", "2026-10-01"]);
  assert.equal(year.periods[11].end, now.getTime());
  // Each month ends where the next begins.
  for (let i = 1; i < 12; i++) assert.equal(year.periods[i - 1].end, year.periods[i].start);
});

test("requests per month: a request on the first of a month counts in that month", () => {
  const now = new Date(Date.UTC(2026, 9, 26, 15));
  const sent = (iso: string): MeasureCard => ({ type: "purchase", createdAt: iso, updatedAt: iso, history: [] });
  const { periods, start } = periodsFor("12m", now);
  const rows = requestsPer([sent("2026-10-01T00:00:00Z"), sent("2026-09-30T23:59:59Z"), sent("2024-01-01T00:00:00Z")], periods);
  assert.equal(rows[11].counts.purchase, 1, "October");
  assert.equal(rows[10].counts.purchase, 1, "September");
  assert.equal(rows.reduce((a, r) => a + r.counts.purchase, 0), 2, "older than the range: left out");
  assert.equal(sentSince(sent("2024-01-01T00:00:00Z"), start), false);
  assert.equal(sentSince(sent("2026-10-01T00:00:00Z"), start), true);
});

test("step names come from the history actions; other entries don't move the clock", () => {
  assert.deepEqual(stepOf("purchase", "Approved (Chair approval) for Ali Chair"), { ends: "Chair approval", moves: true });
  assert.deepEqual(stepOf("purchase", "Sent back to Chair approval (from Finance review)"), { ends: "Finance review", moves: true });
  assert.deepEqual(stepOf("purchase", "Confirmed W-9 on file"), { ends: null, moves: false });
  assert.deepEqual(stepOf("event", "Submitted for Sat, Nov 7"), { ends: null, moves: true });
  assert.deepEqual(stepOf("event", "Approved (executive review)"), { ends: "Executive review", moves: true });
  assert.deepEqual(stepOf("ticket", "Added 2 photos"), { ends: null, moves: false });
  assert.deepEqual(stepOf("marketing", "Scheduled, to finish by Friday, October 30"), { ends: "New", moves: true });
});

test("marketing's approval step: sent, answered or gone ahead without, then marketed", () => {
  const ends = (action: string) => stepOf("marketing", action).ends;
  assert.equal(ends("Sent for approval"), "In progress");
  assert.equal(ends("Approved the draft"), "Waiting on the requester's approval");
  assert.equal(ends("Asked for changes"), "Waiting on the requester's approval");
  assert.equal(ends("Went ahead without the requester's approval (no answer by Mon, Nov 2, 3:00 PM)"), "Waiting on the requester's approval");
  assert.equal(ends("Marked as marketed"), "Approved");
  assert.equal(ends("Marked as marketed (nothing to approve)"), "In progress");
  assert.equal(ends("Done"), "In progress", "requests finished before the approval step");
  const steps = stepTimes([card("marketing", [[0, "Submitted"], [10, "Scheduled, to finish by Friday, October 30"], [12, "Started"], [20, "Sent for approval"], [26, "Approved the draft"], [28, "Marked as marketed"]])], "marketing");
  assert.deepEqual(steps.map((s) => s.step), ["New", "Scheduled", "In progress", "Waiting on the requester's approval", "Approved"]);
});

test("time at each step: median and longest, only finished waits", () => {
  const cards = [
    card("purchase", [[0, "Submitted"], [10, "Approved (Chair approval)"], [11, "Confirmed W-9 on file"], [40, "Approved (Finance review)"], [64, "Paid"]]),
    card("purchase", [[0, "Submitted"], [30, "Approved (Chair approval)"], [36, "Returned for changes (Finance review)"], [48, "Edited and resubmitted"]]),
    card("purchase", [[0, "Submitted"], [20, "Approved (Chair approval)"]]), // still at finance: not counted there
    card("event", [[0, "Submitted for Sat, Nov 7"], [5, "Approved as director"]]),
  ];
  const t = stepTimes(cards, "purchase");
  const chair = t.find((s) => s.step === "Chair approval")!;
  assert.equal(chair.times, 3);
  assert.equal(chair.medianMs, 20 * H);
  assert.equal(chair.longestMs, 30 * H);
  // The W-9 note doesn't restart the clock: finance waited 30 hours, not 29.
  assert.deepEqual(t.find((s) => s.step === "Finance review"), { step: "Finance review", times: 2, medianMs: 18 * H, longestMs: 30 * H });
  assert.equal(t.find((s) => s.step === "To pay")!.medianMs, 24 * H);
  assert.equal(t.find((s) => s.step === "Back with the requester")!.longestMs, 12 * H);
  // In the order a request moves, not the order they turn up.
  assert.deepEqual(t.map((s) => s.step), ["Chair approval", "Finance review", "Back with the requester", "To pay"]);
  assert.deepEqual(stepTimes(cards, "event"), [{ step: "Director review", times: 1, medianMs: 5 * H, longestMs: 5 * H }]);
  const events = stepTimes([card("event", [[0, "Submitted for Sat, Nov 7"], [2, "Approved as director"], [5, "Approved (executive review)"]]), card("event", [[0, "Submitted for Sat, Nov 7"], [1, "Approved (executive review)"]])], "event");
  assert.deepEqual(events.map((s) => s.step), ["Director review", "Executive review"]);
});

test("time at each step reads a real purchase's history", () => {
  const settings: pw.RoutingSettings = { approversFor: () => ({ chairs: ["chair@x.org"], backups: [] }), executiveThreshold: 2500 };
  const vol: pw.Actor = { email: "vol@x.org", name: "Vol", roles: ["member"] };
  const chair: pw.Actor = { email: "chair@x.org", name: "Chair", roles: ["member", "chairs"] };
  const fin: pw.Actor = { email: "fin@x.org", name: "Fin", roles: ["member", "finance"] };
  const r = parsePurchaseInput(
    { kind: "pay", fund: "Youth Expenses", description: "Snacks", payee: "Known Vendor", delivery: "committee_box", mailingAddress: "1 Main St, Raleigh, NC 27601", lines: [{ accountId: "a38", amount: "20" }], attestationName: "Vol" },
    { requesterName: "Vol", cards: [], vendors: [{ name: "Known Vendor", w9OnFile: true }] },
  );
  if (!r.ok) throw new Error(r.errors.join("; "));
  let c = pw.submit(pw.newPurchase(r.details, vol.email, at(0)), vol, settings, at(0));
  c = pw.approve(c, chair, settings, at(6));
  c = pw.approve(c, fin, settings, at(30));
  const t = stepTimes([{ type: "purchase", createdAt: at(0), updatedAt: c.updatedAt, history: c.purchase.history }], "purchase");
  assert.deepEqual(t.map((s) => [s.step, s.medianMs / H]), [["Chair approval", 6], ["Finance review", 24]]);
});

test("median, and waits in words", () => {
  assert.equal(median([]), 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(fmtWait(20 * 60_000), "Under an hour");
  assert.equal(fmtWait(H), "1 hour");
  assert.equal(fmtWait(5 * H), "5 hours");
  assert.equal(fmtWait(DAY), "1 day");
  assert.equal(fmtWait(3.4 * DAY), "3.5 days");
});

test("sent back: requests that came back to the requester, and how often", () => {
  const cards = [
    card("purchase", [[0, "Submitted"], [1, "Returned for changes (Chair approval)"], [2, "Edited and resubmitted"], [3, "Returned for changes (Finance review)"]]),
    card("purchase", [[0, "Submitted"]]),
    card("marketing", [[0, "Submitted"], [4, "Asked a question"]]),
    card("event", [[0, "Submitted for Sat, Nov 7"], [3, "Sent back for changes (Director review)"]]),
  ];
  const s = Object.fromEntries(sentBack(cards).map((x) => [x.type, x]));
  assert.deepEqual(s.purchase, { type: "purchase", requests: 2, sentBack: 1, times: 2 });
  assert.equal(s.marketing.sentBack, 1);
  assert.equal(s.event.times, 1);
  assert.deepEqual(s.ticket, { type: "ticket", requests: 0, sentBack: 0, times: 0 });
});

test("forms started but not sent: counts since a day, never below zero", () => {
  const started = [
    { day: "2026-10-01", form: "event" as const, count: 5 },
    { day: "2026-10-02", form: "event" as const, count: 2 },
    { day: "2026-09-20", form: "event" as const, count: 9 }, // before the window
    { day: "2026-10-02", form: "ticket" as const, count: 1 },
  ];
  const cards = [card("event", [[0, "Submitted for Sat, Nov 7"]]), card("event", [[24, "Submitted for Sat, Nov 7"]]), card("ticket", [[0, "Opened by the schedule"]]), card("ticket", [[1, "Reported"]])];
  const r = Object.fromEntries(startedVsSent(started, cards, "2026-10-01").map((x) => [x.form, x]));
  assert.deepEqual(r.event, { form: "event", started: 7, sent: 2, notSent: 5 });
  assert.deepEqual(r.ticket, { form: "ticket", started: 1, sent: 2, notSent: 0 });
  assert.equal(r.purchase.started, 0);
});

test("feedback by kind, with the open ones", () => {
  const f = feedbackByKind([
    { kind: "problem", status: "new" },
    { kind: "problem", status: "done" },
    { kind: "idea", status: "new" },
  ]);
  assert.deepEqual(
    f.map((x) => [x.kind, x.count, x.open]),
    [["problem", 2, 1], ["idea", 1, 1], ["question", 0, 0]],
  );
});
