/**
 * Events & Rooms rules: series, room checks, review and who hears what.
 * Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canOpenEvent, canViewEvent } from "./access";
import { parseEventInput } from "./input";
import { eventCommentNotices, eventNotices } from "./notices";
import { type GoogleRoom, mergeRooms, roomsOverlap, roomsToCheck } from "./rooms";
import { type BusyItem, eventChecks, eventFlags, findClashes, missionReasons } from "./rules";
import { occurrences, rrule, seriesMaxEnd } from "./series";
import type { EventInput } from "./types";
import * as wf from "./workflow";

const D = "x.org";
const google: GoogleRoom[] = [
  { id: "mphA", name: "MPH A", building: "Main", capacity: 75, calendarId: "mpha@resource" },
  { id: "mphB", name: "MPH B", building: "Main", capacity: 75, calendarId: "mphb@resource" },
  { id: "mphAB", name: "MPH A&B", building: "Main", capacity: 150, calendarId: "mphab@resource" },
  { id: "r250", name: "Room 250", building: "Main", capacity: 20, calendarId: "r250@resource" },
  { id: "r240", name: "Room 240", building: "Main", capacity: 30, calendarId: "r240@resource" },
];
const rooms = mergeRooms(google, {
  mphA: { bookable: true, food: true, mph: true },
  mphB: { bookable: true, food: true, mph: true },
  mphAB: { bookable: true, food: true, mph: true, overlaps: ["mphA", "mphB"] },
  r250: { bookable: true },
  r240: { bookable: true, food: true, restricted: true },
});

const base = (over: Partial<EventInput> = {}): EventInput => ({
  title: "Youth Game Night",
  description: "Board games, a trivia round and dinner for youth and parents. ".repeat(4),
  committeeGroup: `portal-team-youth@${D}`,
  committeeName: "Youth",
  date: "2026-11-14",
  start: "18:00",
  end: "20:00",
  setup: 30,
  teardown: 30,
  rooms: ["r250"],
  attendance: 15,
  budget: 100,
  food: false,
  isPublic: false,
  registration: false,
  av: false,
  setupNotes: "",
  newProgram: false,
  outsideSpeaker: false,
  fundraiser: false,
  teamNotes: "",
  ...over,
});
const ctx = (busy: BusyItem[] = [], over = {}) => ({ rooms, busy, today: "2026-10-23", rules: {}, mayBookRestricted: false, ...over });

test("series: weekly, every other week and monthly dates; every series ends", () => {
  assert.deepEqual(occurrences("2026-11-03", { freq: "weekly", until: "2026-11-24" }), ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]);
  assert.deepEqual(occurrences("2026-11-03", { freq: "biweekly", until: "2026-12-01" }), ["2026-11-03", "2026-11-17", "2026-12-01"]);
  // The 1st Tuesday each month.
  assert.deepEqual(occurrences("2026-11-03", { freq: "monthly", until: "2027-01-31" }), ["2026-11-03", "2026-12-01", "2027-01-05"]);
  assert.equal(seriesMaxEnd("2026-11-03"), "2027-02-02");
  assert.equal(rrule("2026-11-03", { freq: "biweekly", until: "2026-12-01" }), "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;UNTIL=20261201T235959Z");
  assert.equal(rrule("2026-11-03", { freq: "monthly", until: "2027-01-31" }), "RRULE:FREQ=MONTHLY;BYDAY=1TU;UNTIL=20270131T235959Z");
});

test("rooms: the full gym shares space with each half; halves don't share with each other", () => {
  const r = (id: string) => rooms.find((x) => x.id === id);
  assert.equal(roomsOverlap(r("mphAB"), r("mphA")), true);
  assert.equal(roomsOverlap(r("mphA"), r("mphAB")), true);
  assert.equal(roomsOverlap(r("mphA"), r("mphB")), false);
  assert.deepEqual(roomsToCheck(["mphA"], rooms).map((x) => x.id).sort(), ["mphA", "mphAB"]);
});

test("checks: a free room is all clear; a clash, including setup and cleanup, stops the request", () => {
  const free = eventChecks(base(), ctx());
  assert.equal(free.blocked, false);
  assert.ok(free.checks.some((c) => c.sev === "ok" && /Room 250 is free/.test(c.text)));

  // The booking ends at 17:45, inside our 17:30 setup.
  const busy: BusyItem[] = [{ roomId: "r250", date: "2026-11-14", start: "16:00", end: "17:45", label: "Sisters' class", kind: "booking", eventId: "cal1" }];
  const r = eventChecks(base(), ctx(busy));
  assert.equal(r.blocked, true);
  assert.equal(r.clashes.length, 1);
  assert.equal(r.clashes[0].key, "cal:cal1");
  assert.equal(eventChecks(base({ setup: 0 }), ctx(busy)).blocked, false);
});

test("checks: booking a half gym clashes with a full-gym event, and a series lists the dates it clashes on", () => {
  const busy: BusyItem[] = [
    { roomId: "mphAB", date: "2026-11-10", start: "18:00", end: "19:00", label: "Youth open gym", kind: "booking", cardId: "EV-1101" },
    { roomId: "mphAB", date: "2026-11-24", start: "18:00", end: "19:00", label: "Youth open gym", kind: "booking", cardId: "EV-1101" },
  ];
  const e = base({ rooms: ["mphA"], date: "2026-11-03", recur: { freq: "weekly", until: "2026-11-24" }, attendance: 20 });
  const c = findClashes(e, rooms, busy);
  assert.deepEqual(c.map((x) => [x.key, x.dates]), [["card:EV-1101", ["2026-11-10", "2026-11-24"]]]);
  assert.match(eventChecks(e, ctx(busy)).checks.find((x) => x.sev === "bad")!.text, /on 2 of 4 dates/);
  // Editing the same request: its own holds don't count.
  assert.equal(findClashes(e, rooms, busy, { excludeCard: "EV-1101" }).length, 0);
});

test("checks: policy flags go to reviewers without stopping the request", () => {
  const r = eventChecks(base({ rooms: ["r240"], food: true, attendance: 40, end: "22:30", date: "2026-10-27" }), ctx());
  const warn = r.checks.filter((c) => c.sev === "warn").map((c) => c.text).join("\n");
  assert.equal(r.blocked, false);
  assert.match(warn, /holds 30/);
  assert.match(warn, /leadership, imams or committee chairs/);
  assert.match(warn, /After-hours security/);
  assert.match(warn, /Only 4 days away/);
  // Food in Room 250 isn't allowed; the message lists rooms that allow it.
  assert.match(eventChecks(base({ food: true }), ctx()).checks.find((c) => /Food isn't allowed/.test(c.text))!.text, /MPH A/);
  // Rules an admin turned off don't show.
  assert.equal(eventChecks(base({ food: true }), ctx([], { rules: { food: false } })).checks.some((c) => /Food/.test(c.text)), false);
});

test("checks: the MPH needs a 2-hour cleaning gap; a public event needs its marketing details", () => {
  const busy: BusyItem[] = [{ roomId: "mphA", date: "2026-11-14", start: "15:00", end: "16:45", label: "Sisters' fitness", kind: "booking", eventId: "f1" }];
  const r = eventChecks(base({ rooms: ["mphA"] }), ctx(busy));
  assert.ok(r.checks.some((c) => c.sev === "warn" && /cleaning gap/.test(c.text)));
  const pub = eventChecks(base({ isPublic: true, brief: { subtitle: "", text: "", flyer: "", regLink: "", payment: "", final: true } }), ctx());
  assert.equal(pub.blocked, true);
  assert.match(pub.checks.find((c) => c.block)!.text, /the announcement text and a one-line subtitle\./);
});

test("checks: a series longer than 3 months, or an end before the start, stops the request", () => {
  assert.equal(eventChecks(base({ recur: { freq: "weekly", until: "2027-06-01" } }), ctx()).blocked, true);
  assert.equal(eventChecks(base({ end: "17:00" }), ctx()).blocked, true);
});

test("checks: mission reasons are listed", () => {
  assert.deepEqual(missionReasons(base({ newProgram: true, attendance: 200, budget: 3000 })), ["new program", "200 expected", "budget $3,000"]);
});
test("flags: food, outside speaker, new program and fundraiser show as pills, in that order", () => {
  assert.deepEqual(eventFlags(base({})), []);
  assert.deepEqual(eventFlags(base({ fundraiser: true, food: true, newProgram: true, outsideSpeaker: true })), ["Food served", "Outside speaker", "New program", "Fundraiser"]);
});


test("input: the form is checked and only allowed committees and rooms are accepted", () => {
  const c = { committees: [{ group: `portal-team-youth@${D}`, name: "Youth" }], roomIds: ["r250", "mphA"] };
  const raw = { ...base(), rooms: ["r250"], agree: "on", recurFreq: "none" };
  const ok = parseEventInput(raw as never, c);
  assert.ok(ok.ok);
  const bad = parseEventInput({ ...raw, committeeGroup: `portal-team-women@${D}`, rooms: ["r240"], agree: undefined } as never, c);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.errors.length, 3);
});

// ---- Review -----------------------------------------------------------

const owner: wf.EventActor = { email: `ychair@${D}`, name: "Youth Chair", roles: ["member", "chairs"] };
const director: wf.EventActor = { email: `dir@${D}`, name: "Director", roles: ["member"] };
const exec: wf.EventActor = { email: `exec@${D}`, name: "Exec", roles: ["member", "executive"] };
const office: wf.EventActor = { email: `office@${D}`, name: "Office", roles: ["member", "office"] };
const NOW = "2026-10-23T14:00:00Z";
const newCard = (input = base()) => ({ ...wf.newEvent(input, owner, NOW, []), id: "EV-1101" });

test("review: the director first, then any executive; nobody reviews their own event", () => {
  const c = wf.submit(newCard(), owner, [director.email], NOW);
  assert.equal(c.event.stage, "director");
  assert.equal(c.status, "in_review");
  assert.equal(wf.holdsWanted(c), "tentative");
  assert.equal(wf.permission(c, exec, "approve", [director.email]).ok, false);
  assert.equal(wf.permission(c, office, "approve", [director.email]).ok, false);
  const d = wf.approve(c, director, [director.email], NOW);
  assert.equal(d.event.stage, "mission");
  assert.equal(wf.permission(d, director, "approve", [director.email]).ok, false);
  const e = wf.approve(d, exec, [director.email], NOW);
  assert.equal(e.status, "approved");
  assert.equal(wf.holdsWanted(e), "confirmed");
  assert.deepEqual(e.event.approvals.map((a) => a.stage), ["director", "mission"]);
});

test("review: no director, or the requester is the director: straight to the executive", () => {
  assert.equal(wf.submit(newCard(), owner, [], NOW).event.stage, "mission");
  assert.equal(wf.submit(newCard(), owner, [owner.email], NOW).event.stage, "mission");
  const own = wf.submit(newCard(), owner, [], NOW);
  assert.equal(wf.permission(own, { ...owner, roles: [...owner.roles, "executive"] }, "approve").ok, false);
});

test("review: sending back drops the hold until resubmitted; deny and cancel take it off", () => {
  const c = wf.submit(newCard(), owner, [director.email], NOW);
  const back = wf.returnForChanges(c, director, [director.email], NOW, "Pick a room without a school-hours conflict");
  assert.equal(back.status, "changes_requested");
  assert.equal(wf.holdsWanted(back), "none");
  assert.match(back.waitingOn!, /school-hours/);
  assert.throws(() => wf.returnForChanges(c, director, [director.email], NOW, " "), /what needs to change/);
  const again = wf.resubmit(back, base({ rooms: ["mphA"] }), owner, [director.email], NOW, []);
  assert.equal(again.event.stage, "director");
  assert.deepEqual(again.event.rooms, ["mphA"]);
  assert.equal(wf.holdsWanted(wf.deny(again, director, [director.email], NOW, "Not this term")), "none");
  assert.equal(wf.cancel(again, owner, [director.email], NOW).status, "cancelled");
  assert.equal(wf.permission(again, director, "cancel").ok, false);
});

test("slot asks: a request waits for the answer; a moved event needs only the director", () => {
  const waiting = wf.submit(newCard(), owner, [director.email], NOW, { waitingOnAsk: "SR-1001" });
  assert.equal(waiting.event.stage, "slot");
  assert.equal(wf.holdsWanted(waiting), "none");
  assert.equal(wf.permission(waiting, director, "approve", [director.email]).ok, false);
  assert.equal(wf.slotGranted(waiting, [director.email], NOW, "SR-1001").event.stage, "director");
  assert.equal(wf.slotRefused(waiting, [director.email], NOW, "Kept").status, "changes_requested");

  const approved = wf.approve(wf.approve(wf.submit(newCard(base({ date: "2026-11-03", recur: { freq: "weekly", until: "2026-11-24" } })), owner, [director.email], NOW), director, [director.email], NOW), exec, [director.email], NOW);
  const moved = wf.releaseToMove(approved, [director.email], NOW, "SR-1002", ["2026-11-10"]);
  assert.equal(moved.status, "changes_requested");
  assert.equal(wf.holdsWanted(moved), "keep", "its other dates stay held while the owner picks a new time");
  assert.deepEqual(moved.event.dates, ["2026-11-03", "2026-11-17", "2026-11-24"]);
  const re = wf.resubmit(moved, { ...moved.event, date: "2026-11-04", recur: { freq: "weekly", until: "2026-11-25" } }, owner, [director.email], NOW, []);
  assert.equal(re.event.stage, "director");
  const done = wf.approve(re, director, [director.email], NOW);
  assert.equal(done.status, "approved", "no executive step for a moved event");
  assert.equal(wf.resubmit(moved, moved.event, owner, [], NOW, []).status, "approved", "no director: approved straight away");

  const dropped = wf.dropDates(approved, [director.email], NOW, "SR-1003", ["2026-11-24"]);
  assert.equal(dropped.status, "approved");
  assert.deepEqual(dropped.event.released, ["2026-11-24"]);
});

test("notices: the director and then the executive get alerts; the requester hears the outcome", () => {
  const sub = wf.submit(newCard(), owner, [director.email], NOW);
  assert.deepEqual(eventNotices(null, sub, owner, [director.email]).map((n) => ["email" in n.to ? n.to.email : n.to.role, n.alert]), [[director.email, true]]);
  const d = wf.approve(sub, director, [director.email], NOW);
  assert.deepEqual(eventNotices(sub, d, director, [director.email]).map((n) => ["email" in n.to ? n.to.email : n.to.role, n.alert]), [["executive", true]]);
  const e = wf.approve(d, exec, [director.email], NOW);
  assert.deepEqual(eventNotices(d, e, exec, [director.email]).map((n) => ["email" in n.to ? n.to.email : n.to.role, n.alert]), [[owner.email, false]]);
  const back = wf.returnForChanges(sub, director, [director.email], NOW, "Fix the room");
  assert.deepEqual(eventNotices(sub, back, director, [director.email]).map((n) => n.alert), [true]);
  assert.ok(eventCommentNotices(sub, owner, "A question", [director.email]).every((n) => !n.alert));
});

test("access: approved events are open to everyone; pending ones to the people involved", () => {
  const sub = wf.submit(newCard(), owner, [director.email], NOW);
  const someone = { email: `vol@${D}`, name: "Vol", roles: ["member" as const] };
  assert.equal(canViewEvent(sub, someone), false);
  assert.equal(canViewEvent(sub, { ...someone, leads: [`portal-team-youth@${D}`] }), true);
  assert.equal(canViewEvent(sub, { ...someone, roles: ["member", "office"] }), true);
  assert.equal(canViewEvent({ ...sub, status: "approved" }, someone), true);
});

test("access: whoever is asked for their time can open the asking event", () => {
  const sub = wf.submit(newCard(), owner, [director.email], NOW);
  const someone = { email: `vol@${D}`, name: "Vol", roles: ["member" as const] };
  assert.equal(canOpenEvent(sub, someone, false), false);
  assert.equal(canOpenEvent(sub, someone, true), true);
});

// ---- Renewal ------------------------------------------------------------

test("renewal: opens 30 days before the series ends; the next period carries the pattern on", async () => {
  const { nextPeriod, renewalState, checkRenewalDates } = await import("./renewal");
  const series = base({ date: "2026-11-03", recur: { freq: "weekly", until: "2027-01-26" } });
  const ok = wf.approve(wf.approve(wf.submit(newCard(series), owner, [director.email], NOW), director, [director.email], NOW), exec, [director.email], NOW);
  const me = { email: owner.email, office: false };
  assert.deepEqual(renewalState(ok, me, "2026-12-20"), { can: false, why: "Renewal opens Dec 27, 2026, 30 days before the series ends.", opens: "2026-12-27" });
  assert.deepEqual(renewalState(ok, me, "2026-12-27"), { can: true });
  assert.equal(renewalState(ok, { email: "someone@x.org", office: false }, "2026-12-27").can, false);
  assert.equal(renewalState(ok, { email: "office@x.org", office: true }, "2026-12-27").can, true);
  assert.equal(renewalState(ok, me, "2027-02-01").can, false, "ended");
  assert.equal(renewalState(ok, me, "2026-12-27", { ...ok, id: "EV-2000", status: "in_review" }).can, false, "already requested");
  assert.equal(renewalState(ok, me, "2026-12-27", { ...ok, id: "EV-2000", status: "denied" }).can, true);
  assert.deepEqual(nextPeriod("2026-11-03", { freq: "weekly", until: "2027-01-26" }), { date: "2027-02-02", recur: { freq: "weekly", until: "2027-05-01" } });
  assert.equal(nextPeriod("2026-11-03", { freq: "biweekly", until: "2027-01-26" }).date, "2027-02-09");
  assert.equal(nextPeriod("2026-11-03", { freq: "monthly", until: "2027-01-31" }).date, "2027-02-02", "the 1st Tuesday again");
  assert.match(checkRenewalDates(ok, "2027-01-20")!, /after the current one ends/);
  assert.equal(checkRenewalDates(ok, "2027-02-02"), null);
  assert.equal(renewalState(newCard(base()), me, "2026-12-27").can, false, "one-time events don't renew");
});

test("renewal: the requester is told once, when renewal opens", async () => {
  const { renewalDue, renewalReminder } = await import("./renewal");
  const ok = wf.approve(wf.approve(wf.submit(newCard(base({ date: "2026-11-03", recur: { freq: "weekly", until: "2027-01-26" } })), owner, [director.email], NOW), director, [director.email], NOW), exec, [director.email], NOW);
  assert.equal(renewalDue(ok, "2026-12-26"), false);
  assert.equal(renewalDue(ok, "2026-12-27"), true);
  const r = renewalReminder(ok, NOW);
  assert.equal(r.notice.alert, true);
  assert.match(r.notice.text, /request the next period now/);
  assert.equal(renewalDue(r.card, "2026-12-28"), false);
  assert.equal(renewalDue({ ...ok, event: { ...ok.event, renewedBy: "EV-2000" } }, "2026-12-28"), false);
});
