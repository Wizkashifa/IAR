/**
 * "My work today", linked tickets and how late a ticket is. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ORG } from "../org";
import type { TicketSchedule } from "./schedules";
import { workToday, worksTickets } from "./today";
import * as wf from "./workflow";
import { addDays } from "../dates";

const d = ORG.domain;
const reporter: wf.TicketActor = { email: `vol@${d}`, name: "Vol Unteer", roles: ["member"] };
const fac: wf.TicketActor = { email: `fac@${d}`, name: "Fac Staff", roles: ["member", "facilities"] };
const fac2: wf.TicketActor = { email: `fac2@${d}`, name: "Fac Two", roles: ["member", "facilities"] };
const office: wf.TicketActor = { email: `office@${d}`, name: "Office", roles: ["member", "office"] };
const members = { facilities: [fac.email, fac2.email], it: [] };

const T = (h: number) => new Date(Date.UTC(2026, 9, 1, 12) + h * 36e5).toISOString();
const NOW = new Date(T(10));
const TODAY = "2026-10-01";

let seq = 1000;
function ticket(over: Partial<wf.NewTicketInput> = {}, extra: Partial<wf.TicketCard["ticket"]> = {}): wf.TicketCard {
  const c = wf.newTicket({ team: "facilities", kind: "request", title: "Faucet drips", room: "Women's Prayer Hall", urgency: "normal", description: "Drips.", ...over }, reporter, T(0));
  c.id = `TK-${++seq}`;
  return { ...c, ticket: { ...c.ticket, ...extra } };
}
const mineTo = (c: wf.TicketCard, who = fac) => wf.assign(c, who, T(1), who.email, members);
const due = (c: wf.TicketCard, dueDate: string): wf.TicketCard => ({ ...c, ticket: { ...c.ticket, dueDate } });

test("my work today: mine with urgent and late first, then due today, then the rest", () => {
  const plain = mineTo(ticket({ title: "Plain" }));
  const dueToday = due(mineTo(ticket({ title: "Due today" })), TODAY);
  const late = due(mineTo(ticket({ title: "Late" })), "2026-09-28");
  const urgent = mineTo(ticket({ title: "Urgent", urgency: "urgent" }));
  const someoneElse = mineTo(ticket({ title: "Fac Two's" }), fac2);
  const w = workToday([plain, dueToday, late, urgent, someoneElse], fac, NOW, TODAY);
  assert.deepEqual(
    w.mine.map((c) => c.title),
    ["Late", "Urgent", "Due today", "Plain"],
  );
  assert.ok(!w.mine.includes(someoneElse));
});

test("my work today: untaken is my team's only, most urgent and oldest first; resolved and other teams left out", () => {
  const low = ticket({ title: "Low", urgency: "low" });
  const high = ticket({ title: "High", urgency: "high" });
  const it = ticket({ title: "IT one", team: "it" });
  const fixed = wf.resolve(mineTo(ticket({ title: "Fixed" })), fac, T(2), "Done");
  const w = workToday([low, high, it, fixed], fac, NOW, TODAY);
  assert.deepEqual(w.untaken.map((c) => c.title), ["High", "Low"]);
  assert.equal(w.mine.length, 0);
});

test("my work today: preventive due this week (mine or nobody's), and schedules opening this week", () => {
  const thisWeek = ticket({ title: "Filters", kind: "preventive" }, { dueDate: addDays(TODAY, 3) });
  const later = ticket({ title: "Roof check", kind: "preventive" }, { dueDate: addDays(TODAY, 20) });
  const theirs = ticket({ title: "Theirs", kind: "preventive" }, { dueDate: TODAY, assigneeEmail: fac2.email });
  const sched = (over: Partial<TicketSchedule>): TicketSchedule => ({ id: "S", team: "facilities", name: "Gutters", frequency: "monthly", next: addDays(TODAY, 2), room: "Outside / parking", urgency: "normal", paused: false, createdBy: fac.email, createdAt: T(0), updatedAt: T(0), ...over });
  const w = workToday([thisWeek, later, theirs], fac, NOW, TODAY, [sched({}), sched({ id: "P", paused: true }), sched({ id: "L", next: addDays(TODAY, 30) }), sched({ id: "IT", team: "it" })]);
  assert.deepEqual(w.preventive.map((c) => c.title), ["Filters"]);
  assert.deepEqual(w.upcoming.map((s) => s.id), ["S"]);
});

test("my work today is for people on a ticket team; the office assigns but doesn't do the work", () => {
  assert.equal(worksTickets(fac), true);
  assert.equal(worksTickets(office), false);
  assert.equal(worksTickets(reporter), false);
  const w = workToday([ticket()], office, NOW, TODAY);
  assert.equal(w.untaken.length, 0);
});

test("late text: days past the target date, or hours not started past the response time", () => {
  assert.equal(wf.lateText(due(ticket(), "2026-09-28"), NOW, TODAY), "3 days late");
  const urgent = ticket({ urgency: "urgent" });
  assert.equal(wf.lateText(urgent, new Date(T(5)), TODAY), "Not started for 5 hours");
  assert.equal(wf.lateText(urgent, new Date(T(1)), TODAY), null);
  assert.equal(wf.lateText(urgent, new Date(T(72)), TODAY), "Not started for 3 days");
  // Once someone starts it, the response target no longer applies.
  assert.equal(wf.lateText(wf.start(urgent, fac, T(1)), new Date(T(5)), TODAY), null);
});

test("linked tickets: both keep the link, worded from each side; can't link to itself or twice", () => {
  const a = ticket({ title: "Door won't latch" });
  const b = wf.resolve(mineTo(ticket({ title: "Side door latch" })), fac, T(2), "Replaced strike plate");
  const [a2, b2] = wf.linkTickets(a, b, fac, T(3), "duplicates");
  assert.deepEqual(a2.ticket.links, [{ kind: "duplicates", id: b.id }]);
  assert.deepEqual(b2.ticket.links, [{ kind: "duplicated_by", id: a.id }]);
  assert.match(a2.ticket.history.at(-1)!.action, new RegExp(`same problem as ${b.id}`));
  assert.match(b2.ticket.history.at(-1)!.action, new RegExp(`also reported as ${a.id}`));
  assert.throws(() => wf.linkTickets(a2, b2, fac, T(4), "relates"), /already linked/);
  assert.throws(() => wf.linkTickets(a, a, fac, T(4), "relates"), /itself/);

  const [a3, b3] = wf.unlinkTickets(a2, b2, b.id, fac, T(5));
  assert.deepEqual(a3.ticket.links, []);
  assert.deepEqual(b3!.ticket.links, []);
  // The other ticket may be gone: unlink this side only.
  const [a4, gone] = wf.unlinkTickets(a2, null, b.id, fac, T(5));
  assert.deepEqual(a4.ticket.links, []);
  assert.equal(gone, null);
});

test("linked tickets: only the team or the office can link", () => {
  const a = ticket();
  const b = ticket();
  assert.throws(() => wf.linkTickets(a, b, reporter, T(1), "relates"), /Only the Facilities team or the IAR office/);
  assert.doesNotThrow(() => wf.linkTickets(a, b, office, T(1), "relates"));
});
