/**
 * Changing an event's date or time, fixing a small overlap yourself and one
 * name per stage. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventNotices, rescheduleNotices } from "./notices";
import * as rs from "./reschedule";
import { type GoogleRoom, mergeRooms } from "./rooms";
import { type BusyItem, fixesText, quickFixes } from "./rules";
import type { EventInput } from "./types";
import * as wf from "./workflow";
import { eventModule } from "./module";

const D = "x.org";
const google: GoogleRoom[] = [
  { id: "comm", name: "Community Room", building: "Main", capacity: 40, calendarId: "comm@resource" },
  { id: "r250", name: "Room 250", building: "Main", capacity: 20, calendarId: "r250@resource" },
];
const rooms = mergeRooms(google, { comm: { bookable: true }, r250: { bookable: true } });

const input = (over: Partial<EventInput> = {}): EventInput => ({
  title: "Study circle",
  description: "A weekly study circle.",
  committeeGroup: `portal-team-imam@${D}`,
  committeeName: "Imam Office",
  date: "2026-11-17",
  start: "13:30",
  end: "20:00",
  setup: 30,
  teardown: 30,
  rooms: ["comm"],
  attendance: 20,
  budget: 0,
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

const owner: wf.EventActor = { email: `req@${D}`, name: "Requester", roles: ["member"] };
const director: wf.EventActor = { email: `dir@${D}`, name: "Director", roles: ["member"] };
const exec: wf.EventActor = { email: `exec@${D}`, name: "Exec", roles: ["member", "executive"] };
const DIRS = [director.email];
const T = (n: number) => new Date(Date.UTC(2026, 9, 20 + n, 14)).toISOString();
const TODAY = "2026-10-30";

const card = (over: Partial<EventInput> = {}, directors = DIRS, o: { waitingOnAsk?: string } = {}) => {
  const c = wf.newEvent(input(over), owner, T(0), []);
  return wf.submit({ ...c, id: "EV-9001" }, owner, directors, T(0), o);
};
const approved = (directors = DIRS) => {
  const c = card({}, directors);
  return directors.length ? wf.approve(wf.approve(c, director, directors, T(1)), exec, directors, T(2)) : wf.approve(c, exec, directors, T(2));
};

// A meeting booked straight on the IAR calendar ends at 1:15 PM, inside the 30 minutes of setup.
const meeting: BusyItem = { roomId: "comm", date: "2026-11-17", start: "11:30", end: "13:15", label: "Team meeting", kind: "booking", eventId: "calTeam" };

test("quick fixes: a short overlap from setup can be fixed by starting later or cutting setup", () => {
  const e = input();
  const fixes = quickFixes(e, [meeting], { rooms, busy: [meeting] });
  assert.deepEqual(fixes.map((f) => f.text), ["start at 1:45 PM", "cut setup to 15 min"]);
  assert.deepEqual(fixes[0].edit, { date: e.date, start: "13:45", end: "20:15", setup: 30, teardown: 30 });
  assert.equal(fixes[1].edit.setup, 15);
  assert.equal(fixesText(fixes), "Start at 1:45 PM or cut setup to 15 min to remove the conflict.");
});

test("quick fixes: an overlap at the end is fixed by starting earlier or cutting cleanup", () => {
  const after: BusyItem = { ...meeting, start: "20:20", end: "21:30" };
  const fixes = quickFixes(input(), [after], { rooms, busy: [after] });
  assert.deepEqual(fixes.map((f) => f.text), ["start at 1:20 PM", "cut cleanup to 20 min"]);
});

test("quick fixes: none for a long overlap, and none that would run into another booking", () => {
  const long: BusyItem = { ...meeting, end: "14:30" };
  assert.deepEqual(quickFixes(input(), [long], { rooms, busy: [long] }), []);
  // Starting later would run into an evening booking, so only cutting setup is offered.
  const evening: BusyItem = { ...meeting, start: "20:35", end: "22:00", label: "Evening class", eventId: "calEve" };
  assert.deepEqual(quickFixes(input(), [meeting], { rooms, busy: [meeting, evening] }).map((f) => f.text), ["cut setup to 15 min"]);
});

test("editing: only the requester, not while sent back or closed, and the date locks inside a week", () => {
  const c = card();
  const p = rs.editPermission(c, owner, TODAY);
  assert.deepEqual(p, { ok: true, dateLocked: false });
  assert.equal(rs.editPermission(c, director, TODAY).ok, false);
  assert.equal(rs.editPermission(wf.cancel(c, owner, DIRS, T(1)), owner, TODAY).ok, false);
  assert.equal(rs.editPermission(wf.returnForChanges(c, director, DIRS, T(1), "Pick a bigger room"), owner, TODAY).ok, false);
  const soon = rs.editPermission(c, owner, "2026-11-12");
  assert.ok(soon.ok && soon.dateLocked);
  assert.throws(() => rs.checkEdit(c, { ...rs.timeOf(c.event), date: "2026-11-18" }, soon), /Contact the IAR office/);
  // The time can still change inside the week.
  rs.checkEdit(c, { ...rs.timeOf(c.event), setup: 15 }, soon);
  // With the lead-time rule off, the date isn't locked.
  const off = rs.editPermission(c, owner, "2026-11-12", false);
  assert.ok(off.ok && !off.dateLocked);
  assert.throws(() => rs.checkEdit(c, rs.timeOf(c.event), p), /Nothing changed/);
});

test("before approval: a request waiting on an ask goes on to review once the clash is gone, with old and new values in history", () => {
  const c = card({}, DIRS, { waitingOnAsk: "SR-1001" });
  assert.equal(c.event.stage, "slot");
  const moved = rs.reschedule(c, { ...rs.timeOf(c.event), setup: 15 }, owner, DIRS, T(3), []);
  assert.equal(moved.event.stage, "director");
  assert.equal(moved.status, "in_review");
  assert.equal(moved.event.waitingOnAsk, undefined);
  const h = moved.event.history.find((x) => x.action === "Changed the date or time");
  assert.equal(h?.note, "Setup: 30 → 15 min");
  assert.match(moved.event.history.at(-1)!.action, /goes on to director review/);
  // The director hears it needs review.
  assert.ok(eventNotices(c, moved, owner, DIRS).some((n) => "email" in n.to && n.to.email === director.email && n.alert));
  // Still clashing with the same booking: it keeps waiting on that ask.
  assert.equal(rs.reschedule(c, { ...rs.timeOf(c.event), teardown: 15 }, owner, DIRS, T(3), [], { waitingOnAsk: "SR-1001" }).event.stage, "slot");
});

test("before approval: a request in review keeps its stage and approvals, and the approver who acted is told", () => {
  const atExec = wf.approve(card(), director, DIRS, T(1));
  assert.equal(atExec.event.stage, "mission");
  const moved = rs.reschedule(atExec, { ...rs.timeOf(atExec.event), date: "2026-11-18" }, owner, DIRS, T(3), []);
  assert.equal(moved.event.stage, "mission");
  assert.equal(moved.event.approvals.length, 1);
  assert.deepEqual(moved.event.dates, ["2026-11-18"]);
  assert.equal(moved.event.history.at(-1)!.note, "Date: Tue, Nov 17 → Wed, Nov 18");
  const n = rescheduleNotices(atExec, moved, owner, DIRS);
  assert.ok(n.some((x) => "email" in x.to && x.to.email === director.email && !x.alert));
  assert.ok(n.some((x) => "role" in x.to && x.to.role === "executive"));
});

test("after approval: a change waits for the director, and the approved time stays until then", () => {
  const a = approved();
  assert.throws(() => rs.reschedule(a, { ...rs.timeOf(a.event), start: "14:00" }, owner, DIRS, T(3), []), /ask for the change/);
  const asked = rs.requestChange(a, { ...rs.timeOf(a.event), start: "13:45", end: "20:15" }, owner, DIRS, T(3), []);
  assert.equal(asked.status, "approved");
  assert.equal(asked.event.start, "13:30");
  assert.equal(asked.event.change?.start, "13:45");
  assert.match(asked.waitingOn ?? "", /Director review of a new time/);
  assert.equal(rs.editPermission(asked, owner, TODAY).ok, false);
  // Who can answer: the director, never the requester or an executive while there's a director.
  assert.equal(rs.changePermission(asked, director, DIRS).ok, true);
  assert.equal(rs.changePermission(asked, owner, DIRS).ok, false);
  assert.equal(rs.changePermission(asked, exec, DIRS).ok, false);
  assert.equal(eventModule.needs(asked, director, { directorsOf: () => DIRS }), true);
  const n = rescheduleNotices(a, asked, owner, DIRS);
  assert.ok(n.some((x) => "email" in x.to && x.to.email === director.email && x.alert));

  const ok = rs.approveChange(asked, director, DIRS, T(4));
  assert.equal(ok.event.start, "13:45");
  assert.equal(ok.event.change, undefined);
  assert.equal(ok.waitingOn, undefined);
  assert.match(ok.event.history.find((x) => x.action === "Approved the new date or time")!.note!, /Time: 1:30 PM–8:00 PM → 1:45 PM–8:15 PM/);
  assert.ok(rescheduleNotices(asked, ok, director, DIRS).some((x) => "email" in x.to && x.to.email === owner.email));

  assert.throws(() => rs.declineChange(asked, director, DIRS, T(4), " "), /Say why/);
  const no = rs.declineChange(asked, director, DIRS, T(4), "The hall is being cleaned then");
  assert.equal(no.event.start, "13:30");
  assert.equal(no.event.change, undefined);
  assert.equal(rs.withdrawChange(asked, owner, DIRS, T(4)).event.change, undefined);
});

test("after approval with no director: an executive approves the change", () => {
  const asked = rs.requestChange(approved([]), { ...rs.timeOf(approved([]).event), setup: 15 }, owner, [], T(3), []);
  assert.equal(rs.changePermission(asked, exec, []).ok, true);
  assert.equal(rs.changeStep(asked, []), "Executive review");
});

test("one name per stage: the pill, the step bar and history agree", () => {
  assert.equal(wf.STAGE_LABEL.slot, "Room answer");
  assert.equal(wf.STAGE_LABEL.director, "Director review");
  assert.equal(wf.STAGE_LABEL.mission, "Executive review");
  // No director: the step is skipped, and history names the stage it really goes to.
  const noDir = card({}, [], { waitingOnAsk: "SR-1001" });
  const steps = eventModule.steps(noDir, { directors: [], today: TODAY }).steps;
  assert.equal(steps.find((s) => s.label === "Director review")?.state, "skip");
  assert.equal(noDir.event.history.at(-1)!.action, "Waiting for a room answer (SR-1001) before executive review");
  assert.equal(card({}, DIRS, { waitingOnAsk: "SR-1001" }).event.history.at(-1)!.action, "Waiting for a room answer (SR-1001) before director review");
  assert.doesNotMatch(JSON.stringify(wf.slotGranted(noDir, [], T(1), "SR-1001").event.history), /mission review/);
});

test("closing a change: approve takes the new time and its checks; decline and withdraw keep the approved time, each with its own history", () => {
  const a = approved();
  const checks = [{ sev: "ok" as const, text: "Room is free", rule: "IAR Google Calendar" }];
  const asked = rs.requestChange(a, { ...rs.timeOf(a.event), start: "13:45", end: "20:15" }, owner, DIRS, T(3), checks);
  const alert = rescheduleNotices(a, asked, owner, DIRS).find((x) => "email" in x.to && x.to.email === director.email);
  assert.equal(alert?.delegable, true, "the director can hand the approval to whoever covers for them");

  const ok = rs.approveChange(asked, director, DIRS, T(4), "Fine by me");
  assert.deepEqual(ok.event.checks, checks);
  assert.deepEqual(ok.event.history.slice(-2).map((h) => h.action), ["Approved the new date or time", "Room hold moved on the IAR calendar"]);
  assert.match(ok.event.history.at(-2)!.note!, /\nFine by me$/);

  const no = rs.declineChange(asked, director, DIRS, T(4), " Cleaning then ");
  assert.equal(no.event.history.at(-1)!.action, "Kept the approved time: the new one wasn't approved");
  assert.equal(no.event.history.at(-1)!.note, "Cleaning then");
  assert.equal(no.event.history.length, asked.event.history.length + 1);

  const back = rs.withdrawChange(asked, owner, DIRS, T(4));
  assert.equal(back.event.history.at(-1)!.action, "Withdrew the new date or time. The approved time stays");
  assert.equal(back.event.start, "13:30");
  assert.equal(back.status, "approved");
});
