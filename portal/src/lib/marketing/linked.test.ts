/**
 * Marketing pieces linked to an event: who adds them when, the automatic
 * flyer and announcement, and what happens to them when the event changes.
 * Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardStatus } from "../cards";
import type { EventInput } from "../events/types";
import * as ew from "../events/workflow";
import { parseMarketingInput } from "./forms";
import { EVENT_NOT_APPROVED, autoPiece, eventChanges, mayAddPiece, newPiece, pieceAddedNotices, piecesAfterEventChange, suggestedDue, waitsOnEvent } from "./linked";
import * as wf from "./workflow";

const D = "x.org";
const YOUTH = `portal-team-youth@${D}`;
const owner: ew.EventActor = { email: `vol@${D}`, name: "Vol Unteer", roles: ["member"] };
const exec: ew.EventActor = { email: `exec@${D}`, name: "Exec", roles: ["member", "executive"] };
const mk: wf.Actor = { email: `mk@${D}`, name: "Mark Eting", roles: ["member", "marketing"] };
const chair: wf.Actor = { email: `ychair@${D}`, name: "Youth Chair", roles: ["member", "chairs"], leads: [YOUTH] };
const otherChair: wf.Actor = { email: `wchair@${D}`, name: "Women's Chair", roles: ["member", "chairs"], leads: [`portal-team-women@${D}`] };
const stranger: wf.Actor = { email: `someone@${D}`, name: "Someone", roles: ["member"] };
// Friday, Oct 23 2026, 10 AM in Raleigh.
const NOW = "2026-10-23T14:00:00Z";
const LATER = "2026-10-24T14:00:00Z";

const input = (over: Partial<EventInput> = {}): EventInput => ({
  title: "Youth Game Night",
  description: "Board games and dinner.",
  committeeGroup: YOUTH,
  committeeName: "Youth",
  date: "2026-11-21",
  start: "18:00",
  end: "20:00",
  setup: 30,
  teardown: 30,
  rooms: ["r250"],
  attendance: 60,
  budget: 400,
  food: false,
  isPublic: true,
  registration: false,
  av: false,
  setupNotes: "",
  newProgram: false,
  outsideSpeaker: false,
  fundraiser: false,
  teamNotes: "",
  brief: { subtitle: "Games Night", text: "Come play.", flyer: "", regLink: "", payment: "", final: true },
  ...over,
});
let seq = 1101;
/** Submitted with no director, so it's in executive review. */
const inReview = (over: Partial<EventInput> = {}) => ew.submit({ ...ew.newEvent(input(over), owner, NOW, []), id: `EV-${seq++}` }, owner, [], NOW);
const approved = (over: Partial<EventInput> = {}) => ew.approve(inReview(over), exec, [], NOW);
const as = (c: ew.EventCard, status: CardStatus): ew.EventCard => ({ ...c, status });

let mkSeq = 1001;
const piece = (event: ew.EventCard, answers: Record<string, string> = { piece: "social", due: "2026-11-11" }, by: wf.Actor = mk) => {
  const r = parseMarketingInput({ kind: "event", committee: event.event.committeeName, answers }, { today: "2026-10-23", committees: [event.event.committeeName] });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const c = newPiece(event, r.details, by, NOW);
  c.id = `MK-${mkSeq++}`;
  return c;
};

// ---- Who adds pieces, and when ---------------------------------------------

test("who: the requester, their committee's chair or director, and the marketing team; nobody else", () => {
  const ev = inReview();
  assert.equal(mayAddPiece(ev, owner).ok, true);
  assert.equal(mayAddPiece(ev, chair).ok, true, "chairs the event's committee");
  assert.equal(mayAddPiece(ev, mk).ok, true);
  assert.equal(mayAddPiece(ev, otherChair).ok, false, "a chair of another committee");
  const no = mayAddPiece(ev, stranger);
  assert.ok(!no.ok && /requester/.test(no.reason));
});

test("when: once the event is submitted, in review, sent back or approved; not a draft, declined, cancelled or finished event", () => {
  const ev = inReview();
  for (const st of ["submitted", "in_review", "changes_requested", "approved"] as CardStatus[]) assert.equal(mayAddPiece(as(ev, st), owner).ok, true, st);
  for (const st of ["draft", "denied", "cancelled", "close_out", "closed"] as CardStatus[]) assert.equal(mayAddPiece(as(ev, st), mk).ok, false, st);
  const draft = mayAddPiece(as(ev, "draft"), owner);
  assert.ok(!draft.ok && /Send the event request first/.test(draft.reason));
});

test("needed by: 10 days before the event's first date, never before today", () => {
  assert.equal(suggestedDue(inReview(), "2026-10-23"), "2026-11-11");
  assert.equal(suggestedDue(inReview({ date: "2026-10-28" }), "2026-10-23"), "2026-10-23");
  const series = inReview({ date: "2026-11-03", recur: { freq: "weekly", until: "2026-12-01" } });
  assert.equal(suggestedDue(series, "2026-10-23"), "2026-10-24", "a series counts from its first date");
});

test("a new piece belongs to the event's requester, in the event's committee; the history says who added it", () => {
  const ev = inReview();
  const p = piece(ev, { piece: "social", desc: "Three posts", due: "2026-11-11" }, chair);
  assert.equal(p.ownerEmail, owner.email, "approvals go to the requester");
  assert.equal(p.marketing.requesterName, owner.name);
  assert.equal(p.committee, "Youth");
  assert.equal(p.marketing.kind, "event");
  assert.equal(p.marketing.eventCardId, ev.id);
  assert.equal(p.title, "Social media posts: Youth Game Night");
  assert.equal(p.marketing.stage, "review");
  assert.deepEqual([p.marketing.history[0].by, p.marketing.history[0].action], [chair.email, `Added for ${ev.id} “Youth Game Night”`]);
  assert.equal(p.marketing.history.length, 1, "three weeks out: no short-notice line");
  assert.deepEqual(pieceAddedNotices({ ...p, id: "MK-9" }, chair).map((n) => ["email" in n.to ? n.to.email : "", n.alert]), [[owner.email, false]], "the requester hears, without an alert");
  assert.deepEqual(pieceAddedNotices({ ...p, id: "MK-9" }, owner), [], "nobody hears about their own piece");
});

test("an edited piece keeps its event in the title", () => {
  const p = piece(inReview());
  const edited = wf.edit(p, owner, LATER, { kind: "event", committee: "Youth", answers: { piece: "video", due: "2026-11-11" } });
  assert.equal(edited.title, "Video: Youth Game Night");
});

test("event not approved yet: while it's in review or sent back", () => {
  assert.equal(EVENT_NOT_APPROVED, "Event not approved yet");
  assert.equal(waitsOnEvent(inReview()), true);
  assert.equal(waitsOnEvent(as(inReview(), "changes_requested")), true);
  assert.equal(waitsOnEvent(approved()), false);
  assert.equal(waitsOnEvent(null), false);
  // Marketing can still pick it up and start it.
  const p = piece(inReview());
  const started = wf.start(wf.schedule(p, mk, NOW, "2026-11-11"), mk, NOW);
  assert.equal(started.marketing.stage, "doing");
});

// ---- The automatic piece ------------------------------------------------------

test("auto piece: a public event's final approval adds a flyer and announcement, once", () => {
  const sub = inReview();
  const ok = ew.approve(sub, exec, [], NOW);
  const auto = autoPiece(sub, ok, [], NOW);
  assert.ok(auto);
  assert.equal(auto.title, "Flyer and announcement: Youth Game Night");
  assert.equal(auto.ownerEmail, owner.email);
  assert.equal(auto.marketing.eventCardId, ok.id);
  assert.equal(auto.marketing.answers.due, "2026-11-11");
  assert.deepEqual([auto.marketing.history[0].by, auto.marketing.history[0].action], ["Portal", `Added when ${ok.id} was approved`]);
  assert.equal(autoPiece(sub, ok, [{ ...auto, id: "MK-1" }], NOW), null, "it already has a piece");
  assert.equal(autoPiece(ok, ok, [], NOW), null, "only on the step that approves it");
  assert.equal(autoPiece(null, inReview(), [], NOW), null, "not before approval");
  const priv = inReview({ isPublic: false, brief: undefined });
  assert.equal(autoPiece(priv, ew.approve(priv, exec, [], NOW), [], NOW), null, "not for a private event");
  // A director's approval isn't the final one.
  const dir: ew.EventActor = { email: `dir@${D}`, name: "Director", roles: ["member"] };
  const withDirector = ew.submit({ ...ew.newEvent(input(), owner, NOW, []), id: "EV-2001" }, owner, [dir.email], NOW);
  assert.equal(autoPiece(withDirector, ew.approve(withDirector, dir, [dir.email], NOW), [], NOW), null);
});

test("auto piece: an older event that still has its Marketing task doesn't get one", () => {
  const sub = inReview();
  const ok = ew.approve(sub, exec, [], NOW);
  const old = { ...ok, event: { ...ok.event, tasks: [{ id: "marketing", team: "marketing" as const, title: "Flyer", status: "todo" as const, dueDate: "2026-11-21", history: [] }] } };
  assert.equal(autoPiece(sub, old, [], NOW), null);
});

// ---- When the event changes -----------------------------------------------------

test("cancelled or declined: open pieces are cancelled with why; finished ones stay; whoever has each hears", () => {
  const ok = approved();
  const fresh = piece(ok);
  const working = wf.start(wf.schedule(piece(ok, { piece: "banner", due: "2026-11-11" }), mk, NOW, "2026-11-11"), mk, NOW);
  const done = wf.finish(wf.start(wf.schedule(piece(ok, { piece: "flyer", due: "2026-11-11" }), mk, NOW, "2026-11-11"), mk, NOW), mk, NOW);
  const gone = ew.cancel(ok, owner, [], LATER);
  const r = piecesAfterEventChange(ok, gone, [fresh, working, done], LATER);
  assert.deepEqual(r.pieces.map((p) => [p.id, p.marketing.stage, p.status]), [[fresh.id, "cancelled", "cancelled"], [working.id, "cancelled", "cancelled"]]);
  assert.deepEqual(r.pieces[0].marketing.history.at(-1), { at: LATER, by: "Portal", action: "Cancelled", note: "The event was cancelled." });
  assert.deepEqual(r.notices.map((n) => ["email" in n.to ? n.to.email : n.to.role, n.alert]), [["marketing", false], [mk.email, true]], "the team for a new piece; whoever is working on one, with an alert");
  assert.match(r.notices[1].text, /is cancelled: .* was cancelled\. Nothing more to do\./);

  const sub = inReview();
  const denied = ew.deny(sub, exec, [], LATER, "Not this month");
  const d = piecesAfterEventChange(sub, denied, [piece(sub)], LATER);
  assert.equal(d.pieces[0].marketing.history.at(-1)?.note, "The event was declined.");
  assert.deepEqual(piecesAfterEventChange(denied, denied, d.pieces, LATER), { pieces: [], notices: [] }, "only once");
});

test("sent back for changes: pieces stay as they are", () => {
  const sub = inReview();
  const back = ew.returnForChanges(sub, exec, [], LATER, "Pick another room");
  assert.deepEqual(piecesAfterEventChange(sub, back, [piece(sub)], LATER), { pieces: [], notices: [] });
});

test("date, time or details changed: whoever has each open piece gets an alert; the stage doesn't change", () => {
  const ok = approved();
  const fresh = piece(ok);
  const mine = wf.start(wf.schedule(piece(ok, { piece: "video", due: "2026-11-11" }), mk, NOW, "2026-11-11"), mk, NOW);
  // The requester gives up the time and picks a new one; with no director it's approved again straight away.
  const moved = ew.releaseToMove(ok, [], LATER, "SR-1001", ok.event.dates);
  const back = ew.resubmit(moved, { ...moved.event, date: "2026-11-28", start: "17:00" }, owner, [], LATER, []);
  assert.equal(back.status, "approved");
  assert.deepEqual(eventChanges(ok, back), ["the date", "the time"]);
  const r = piecesAfterEventChange(ok, back, [fresh, mine], LATER);
  assert.deepEqual(r.pieces, [], "nothing to save: same stage, same title");
  assert.deepEqual(r.notices.map((n) => ["email" in n.to ? n.to.email : n.to.role, n.alert, n.href]), [["marketing", true, `/marketing/${fresh.id}`], [mk.email, true, `/marketing/${mine.id}`]]);
  assert.match(r.notices[0].text, /changed the date and the time\. It's now on Sat, Nov 28\./);
  assert.equal(autoPiece(moved, back, [fresh, mine], LATER), null, "re-approval after a move doesn't add another piece");
});

test("a new event name goes into each open piece's title", () => {
  const sub = inReview();
  const auto = { ...autoPiece(sub, ew.approve(sub, exec, [], NOW), [], NOW)!, id: "MK-77" };
  const sentBack = ew.returnForChanges(sub, exec, [], NOW, "Rename it");
  const renamed = ew.resubmit(sentBack, { ...sentBack.event, title: "Family Game Night" }, owner, [], LATER, []);
  const r = piecesAfterEventChange(sentBack, renamed, [auto], LATER);
  assert.deepEqual(r.pieces.map((p) => [p.title, p.marketing.stage]), [["Flyer and announcement: Family Game Night", "review"]]);
  assert.deepEqual(eventChanges(sentBack, renamed), ["the name"]);
  assert.equal(r.notices.length, 1);
});

test("nothing marketing cares about changed: no notices", () => {
  const ok = approved();
  const same = { ...ok, event: { ...ok.event, setupNotes: "Tables in rows", teamNotes: "Thanks" } };
  assert.deepEqual(piecesAfterEventChange(ok, same, [piece(ok)], LATER), { pieces: [], notices: [] });
  assert.deepEqual(piecesAfterEventChange(null, ok, [piece(ok)], LATER), { pieces: [], notices: [] });
});

test("a series has one set of pieces: giving up a date alerts each piece once", () => {
  const series = approved({ date: "2026-11-03", recur: { freq: "weekly", until: "2026-12-01" } });
  const p = piece(series);
  const dropped = ew.dropDates(series, [], LATER, "SR-1002", ["2026-11-17", "2026-11-24"]);
  const r = piecesAfterEventChange(series, dropped, [p], LATER);
  assert.equal(r.notices.length, 1);
  assert.match(r.notices[0].text, /changed the dates\. It's now on 3 dates from/);
});

test("pieces of other events are left alone", () => {
  const ok = approved();
  const other = approved();
  const gone = ew.cancel(ok, owner, [], LATER);
  assert.deepEqual(piecesAfterEventChange(ok, gone, [piece(other)], LATER), { pieces: [], notices: [] });
});
