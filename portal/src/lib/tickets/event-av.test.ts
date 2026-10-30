/**
 * An approved event's A/V as tickets for IT, one per date. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventInput, EventTask } from "../events/types";
import * as ew from "../events/workflow";
import { avComing, avTicket, avTicketsAfterEventChange, avTicketsOnEventDeleted } from "./event-av";
import { ticketNotices } from "./notices";
import * as wf from "./workflow";

const D = "x.org";
const owner: ew.EventActor = { email: `vol@${D}`, name: "Vol Unteer", roles: ["member"] };
const exec: ew.EventActor = { email: `exec@${D}`, name: "Exec", roles: ["member", "executive"] };
const itTech: wf.TicketActor = { email: `it@${D}`, name: "IT Tech", roles: ["member", "it", "av"] };
const NOW = "2026-10-23T14:00:00Z";
const LATER = "2026-10-24T14:00:00Z";
const rooms = (id: string) => ({ r250: "Room 250", mphA: "MPH A" })[id] ?? id;

const input = (over: Partial<EventInput> = {}): EventInput => ({
  title: "Youth Game Night",
  description: "Board games and dinner.",
  committeeGroup: `portal-team-youth@${D}`,
  committeeName: "Youth",
  date: "2026-11-03",
  start: "18:00",
  end: "20:00",
  setup: 30,
  teardown: 30,
  rooms: ["r250"],
  attendance: 60,
  budget: 400,
  food: false,
  isPublic: false,
  registration: false,
  av: true,
  avNeeds: { kinds: ["projector", "sound"], includes: ["mics"], ack: true },
  setupNotes: "",
  newProgram: false,
  outsideSpeaker: false,
  fundraiser: false,
  teamNotes: "Two speakers on stage.",
  ...over,
});
let seq = 1101;
const inReview = (over: Partial<EventInput> = {}) => ew.submit({ ...ew.newEvent(input(over), owner, NOW, []), id: `EV-${seq++}` }, owner, [], NOW);
const weekly = { date: "2026-11-03", recur: { freq: "weekly" as const, until: "2026-11-24" } };
let tk = 2001;
/** The tickets as the store would have them: with IDs. */
const stored = (cards: wf.TicketCard[]) => cards.map((c) => ({ ...c, id: `TK-${tk++}` }));
/** Approves the event and returns it with its tickets. */
function approve(over: Partial<EventInput> = {}) {
  const sub = inReview(over);
  const ok = ew.approve(sub, exec, [], NOW);
  const r = avTicketsAfterEventChange(sub, ok, [], rooms, NOW);
  return { sub, ok, r, tickets: stored(r.create) };
}

test("approval: one ticket per date, due that day, owned by the requester, with what A/V is asked for; one alert for the team", () => {
  const { r, tickets } = approve(weekly);
  assert.deepEqual(tickets.map((t) => [t.ticket.kind, t.ticket.team, t.ticket.eventDate, t.ticket.dueDate]), [
    ["event", "it", "2026-11-03", "2026-11-03"],
    ["event", "it", "2026-11-10", "2026-11-10"],
    ["event", "it", "2026-11-17", "2026-11-17"],
    ["event", "it", "2026-11-24", "2026-11-24"],
  ]);
  const t = tickets[0];
  assert.equal(t.title, "A/V: Youth Game Night · Tue, Nov 3");
  assert.equal(t.ownerEmail, owner.email);
  assert.deepEqual(t.ticket.watchers, [owner.email]);
  assert.equal(t.ticket.room, "Room 250");
  assert.equal(t.ticket.equipment, "Projectors on projector screens, Sound system support");
  assert.match(t.ticket.description, /More than one microphone/);
  assert.match(t.ticket.description, /Two speakers on stage/);
  assert.equal(t.ticket.status, "new");
  assert.equal(wf.lateText(t, new Date("2026-10-30T14:00:00Z"), "2026-10-30"), null, "not late a week after it opened: its date is what counts");
  assert.equal(wf.lateText(t, new Date("2026-11-04T14:00:00Z"), "2026-11-04"), "1 day late");
  assert.deepEqual(r.notices.map((n) => ["role" in n.to ? n.to.role : n.to.email, n.alert]), [["av", true]]);
  assert.match(r.notices[0].text, /is approved: 4 new A\/V tickets, one per date, first on Tue, Nov 3/);
});

test("approval: nothing without A/V, nothing twice, nothing while in review, nothing for an older event with its A/V task", () => {
  assert.deepEqual(approve({ av: false, avNeeds: undefined }).r.create, []);
  const { ok, tickets } = approve();
  assert.equal(tickets.length, 1);
  assert.deepEqual(avTicketsAfterEventChange(ok, ok, tickets, rooms, LATER), { create: [], update: [], notices: [] }, "saved again: nothing new");
  const sub = inReview();
  assert.deepEqual(avTicketsAfterEventChange(sub, sub, [], rooms, NOW).create, []);
  const old: EventTask = { id: "av", team: "av", title: "A/V: support", status: "todo", dueDate: "2026-11-03", history: [] };
  const sub2 = inReview();
  const withTask = { ...ew.approve(sub2, exec, [], NOW), event: { ...ew.approve(sub2, exec, [], NOW).event, tasks: [old] } };
  assert.deepEqual(avTicketsAfterEventChange(sub2, withTask, [], rooms, NOW).create, []);
});

test("cancelled or declined: open tickets cancelled; whoever has one gets an alert, the team a note for the rest; done ones stay", () => {
  const { ok, tickets } = approve(weekly);
  const [a, b, c] = tickets;
  const taken = wf.assign(b, itTech, NOW, itTech.email, { it: [itTech.email], facilities: [] });
  const done = wf.resolve(wf.assign(c, itTech, NOW, itTech.email, { it: [itTech.email], facilities: [] }), itTech, NOW, "Set up");
  const gone = ew.cancel(ok, owner, [], LATER);
  const r = avTicketsAfterEventChange(ok, gone, [a, taken, done, tickets[3]], rooms, LATER);
  assert.deepEqual(r.update.map((t) => [t.id, t.ticket.status]), [[a.id, "cancelled"], [taken.id, "cancelled"], [tickets[3].id, "cancelled"]]);
  assert.equal(r.update[0].ticket.history.at(-1)?.note, "The event was cancelled.");
  assert.deepEqual(r.notices.map((n) => ["role" in n.to ? n.to.role : n.to.email, n.alert]), [["av", false], [itTech.email, true], ["av", false]]);
  const denied = ew.deny(inReview(), exec, [], LATER, "Not this month");
  assert.deepEqual(avTicketsAfterEventChange(denied, denied, [], rooms, LATER).update, [], "only once");
});

test("a date given up cancels only its ticket; A/V no longer asked for cancels them; A/V asked for later adds them", () => {
  const { ok, tickets } = approve(weekly);
  const dropped = ew.dropDates(ok, [], LATER, "SR-1001", ["2026-11-24"]);
  const r = avTicketsAfterEventChange(ok, dropped, tickets, rooms, LATER);
  assert.deepEqual(r.update.map((t) => [t.ticket.eventDate, t.ticket.status]), [["2026-11-24", "cancelled"]]);
  assert.deepEqual(r.create, []);
  assert.match(r.notices[0].text, /no longer takes place on that date/);

  const noAv = { ...ok, event: { ...ok.event, av: false, avNeeds: undefined } };
  assert.deepEqual(avTicketsAfterEventChange(ok, noAv, tickets, rooms, LATER).update.map((t) => t.ticket.status), ["cancelled", "cancelled", "cancelled", "cancelled"]);

  const plain = approve({ av: false, avNeeds: undefined }).ok;
  const withAv = { ...plain, event: { ...plain.event, av: true, avNeeds: { kinds: ["sound"], includes: [], ack: true } } };
  const later = avTicketsAfterEventChange(plain, withAv, [], rooms, LATER);
  assert.equal(later.create.length, 1);
  assert.match(later.notices[0].text, /changed: a new A\/V ticket, on Tue, Nov 3/);
});

test("time, room, name or what's asked for changed: open tickets brought up to date, whoever has each alerted; the status stays", () => {
  const { ok, tickets } = approve();
  const taken = wf.assign(tickets[0], itTech, NOW, itTech.email, { it: [itTech.email], facilities: [] });
  const moved = { ...ok, title: "Youth Movie Night", event: { ...ok.event, start: "19:00", rooms: ["mphA"], avNeeds: { kinds: ["sound"], includes: [], ack: true } } };
  const r = avTicketsAfterEventChange(ok, moved, [taken], rooms, LATER);
  const t = r.update[0];
  assert.equal(t.title, "A/V: Youth Movie Night · Tue, Nov 3");
  assert.equal(t.ticket.room, "MPH A");
  assert.equal(t.ticket.equipment, "Sound system support");
  assert.equal(t.ticket.status, taken.ticket.status);
  assert.equal(t.ticket.history.at(-1)?.action, `Updated from ${ok.id}`);
  assert.deepEqual(r.notices.map((n) => ["email" in n.to ? n.to.email : n.to.role, n.alert]), [[itTech.email, true]]);
  assert.match(r.notices[0].text, /changed the time, the room, the name and what A\/V is asked for/);
  const described = { ...ok, event: { ...ok.event, description: "Now with pizza." } };
  assert.deepEqual(avTicketsAfterEventChange(ok, described, tickets, rooms, LATER).update, [], "the description isn't A/V's business");
});

test("done closes an event's ticket and its requester is told; only the event cancels it", () => {
  const { tickets } = approve();
  const t = wf.assign(tickets[0], itTech, NOW, itTech.email, { it: [itTech.email], facilities: [] });
  const done = wf.resolve(t, itTech, LATER, "Projector and two mics set up");
  assert.equal(done.ticket.status, "closed");
  assert.equal(done.ticket.history.at(-1)?.action, "Done");
  assert.deepEqual(ticketNotices(t, done, itTech).map((n) => ["email" in n.to ? n.to.email : "", n.alert]), [[owner.email, false]]);
  const requester: wf.TicketActor = { email: owner.email, name: owner.name, roles: ["member"] };
  assert.match((wf.permission(tickets[0], requester, "cancel") as { reason: string }).reason, /follows its event/);
  assert.equal(wf.permission(done, requester, "reopen").ok, false);
});

test("deleted event: open tickets cancelled and unlinked; closed ones unlinked without moving; avComing counts events in review with A/V", () => {
  const { ok, tickets } = approve();
  const doneTicket = wf.resolve(wf.assign(stored([avTicket(ok, "2026-11-03", rooms, NOW)])[0], itTech, NOW, itTech.email, { it: [itTech.email], facilities: [] }), itTech, NOW, "Done");
  const r = avTicketsOnEventDeleted(ok, [tickets[0], doneTicket], LATER);
  assert.deepEqual(r.update.map((t) => [t.ticket.status, t.ticket.eventCardId]), [["cancelled", undefined], ["closed", undefined]]);
  assert.equal(r.update[1].updatedAt, doneTicket.updatedAt);
  assert.equal(avComing([inReview(), inReview({ av: false, avNeeds: undefined }), ok]), 1);
});
