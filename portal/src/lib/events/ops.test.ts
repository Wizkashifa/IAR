/**
 * Event operations: team tasks, each team's queue, the daily run sheet, close-out,
 * and linking a purchase to an event.
 * Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Card } from "../cards";
import { parsePurchaseInput, type PurchaseInput } from "../purchases/input";
import { campusesOf, runSheetRows } from "../runsheet";
import { closeOutNotices, closeOutPermission, dueForCloseOut, linkedPurchases, markNudged, needsNudge, spendOf, startCloseOut, submitCloseOut } from "./closeout";
import { linkableEvents } from "./link";
import { TEAM_WORK_HREF, lockedCount, nearTerm, queueItems, recentlyDone, retiredQueueHref } from "./queues";
import { type GoogleRoom, mergeRooms } from "./rooms";
import type { BusyItem } from "./rules";
import { TaskError, actOnTask, assignTask, planTasks, taskNotices, taskPermission, taskUnlockNotices, tasksFor } from "./tasks";
import { addImages, imagesPermission } from "./images";
import type { EventInput, EventTask } from "./types";
import * as wf from "./workflow";

const D = "x.org";
const google: GoogleRoom[] = [
  { id: "mphA", name: "MPH A", building: "Main campus", capacity: 75, calendarId: "mpha@resource" },
  { id: "mphB", name: "MPH B", building: "Main campus", capacity: 75, calendarId: "mphb@resource" },
  { id: "r250", name: "Room 250", building: "Main campus", capacity: 20, calendarId: "r250@resource" },
  { id: "pr1", name: "Page Road Hall", building: "Page Road", capacity: 100, calendarId: "pr1@resource" },
];
const rooms = mergeRooms(google, { mphA: { bookable: true, mph: true }, mphB: { bookable: true, mph: true }, r250: { bookable: true }, pr1: { bookable: true } });

const base = (over: Partial<EventInput> = {}): EventInput => ({
  title: "Youth Game Night",
  description: "Board games and dinner.",
  committeeGroup: `portal-team-youth@${D}`,
  committeeName: "Youth",
  date: "2026-11-14",
  start: "18:00",
  end: "20:00",
  setup: 30,
  teardown: 30,
  rooms: ["r250"],
  attendance: 15,
  budget: 400,
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
const brief = { subtitle: "Games Night", text: "Come play.", flyer: "", regLink: "", payment: "", final: true };
const full = (over: Partial<EventInput> = {}) =>
  base({ isPublic: true, brief, av: true, avNeeds: { kinds: ["projector", "sound"], includes: [], ack: true }, setupNotes: "8 round tables and a small stage", rooms: ["mphA"], ...over });

const owner: wf.EventActor = { email: `ychair@${D}`, name: "Youth Chair", roles: ["member", "chairs"] };
const exec: wf.EventActor = { email: `exec@${D}`, name: "Exec", roles: ["member", "executive"] };
const office: wf.EventActor = { email: `office@${D}`, name: "Office", roles: ["member", "office"] };
const av: wf.EventActor = { email: `av@${D}`, name: "A/V Volunteer", roles: ["member", "it", "av"] };
const av2: wf.EventActor = { email: `av2@${D}`, name: "A/V Volunteer 2", roles: ["member", "it", "av"] };
const marketer: wf.EventActor = { email: `mk@${D}`, name: "Marketing Volunteer", roles: ["member", "marketing"] };
const NOW = "2026-10-23T14:00:00Z";
let seq = 1101;
const newCard = (input = base()) => ({ ...wf.newEvent(input, owner, NOW, []), id: `EV-${seq++}` });
/** Submitted with no director, so it goes straight to the executive. */
const submitted = (input = base()) => wf.submit(newCard(input), owner, [], NOW);
const approved = (input = base()) => wf.approve(submitted(input), exec, [], NOW);

// ---- Tasks ------------------------------------------------------------------

test("tasks: each team the event needs, with due dates; never a Security task; nothing for a private event without A/V", () => {
  const t = planTasks(wf.newEvent(full(), owner, NOW, []).event);
  assert.deepEqual(t.map((x) => [x.id, x.team, x.dueDate]), [
    ["marketing", "marketing", "2026-11-14"],
    ["av", "av", "2026-11-14"],
  ]);
  assert.match(t[0].title, /Games Night/);
  assert.match(t[1].title, /projector/i);
  const late = planTasks(wf.newEvent(full({ end: "22:00" }), owner, NOW, []).event);
  assert.ok(!late.some((x) => (x.team as string) === "security"), "after hours doesn't add a task either");
  assert.deepEqual(planTasks(wf.newEvent(base(), owner, NOW, []).event), []);
});

test("tasks: a series gets one task per team", () => {
  const series = full({ date: "2026-11-03", recur: { freq: "weekly", until: "2026-11-24" } });
  const t = planTasks(wf.newEvent(series, owner, NOW, []).event);
  assert.deepEqual(t.map((x) => [x.team, x.dueDate]), [["marketing", "2026-11-03"], ["av", "2026-11-03"]]);
});

test("tasks: a Security task left on an older event isn't shown or worked", () => {
  const ok = approved(full());
  const old = { id: "security-2026-11-14", team: "security", title: "Room check before and after", status: "todo", dueDate: "2026-11-14", history: [] } as unknown as EventTask;
  const withOld = { ...ok, event: { ...ok.event, tasks: [...ok.event.tasks!, old] } };
  assert.deepEqual(tasksFor(withOld).map((t) => t.team), ["marketing", "av"]);
  assert.equal(taskPermission(withOld, old.id, office, "done").ok, false);
  assert.deepEqual(queueItems([withOld], "av", "2026-10-23").length, 1);
});

test("tasks: locked until approval, added as to-do on approval, dropped on cancel", () => {
  const sub = submitted(full());
  assert.equal(sub.event.tasks, undefined);
  assert.ok(tasksFor(sub).every((t) => t.status === "locked"));
  assert.equal(tasksFor(sub).length, 2);
  const ok = wf.approve(sub, exec, [], NOW);
  assert.equal(ok.event.tasks?.length, 2);
  assert.ok(ok.event.tasks!.every((t) => t.status === "todo"));
  assert.ok(ok.event.history.some((h) => /Team tasks unlocked: Marketing and A\/V/.test(h.action)));
  const gone = wf.cancel(ok, owner, [], NOW);
  assert.equal(gone.event.tasks, undefined);
  assert.deepEqual(tasksFor(gone), []);
});

test("tasks: approval tells each team once, in its Chat space; giving up a date doesn't tell them again", () => {
  const sub = submitted(full({ date: "2026-11-03", recur: { freq: "weekly", until: "2026-11-24" } }));
  const ok = wf.approve(sub, exec, [], NOW);
  const n = taskUnlockNotices(sub, ok);
  assert.deepEqual(n.map((x) => ["role" in x.to ? x.to.role : x.to.email, x.alert]), [["marketing", true], ["av", true]]);
  assert.match(n[1].text, /Due Tue, Nov 3|Due .*Nov 3/);
  const dropped = wf.dropDates(ok, [], NOW, "SR-1001", ["2026-11-24"]);
  assert.deepEqual(taskUnlockNotices(ok, dropped), []);
});

test("tasks: anyone on the team hands a task to a teammate; they get an alert", () => {
  const members = [marketer.email, `mk2@${D}`];
  const ok = approved(full());
  assert.throws(() => assignTask(submitted(full()), "marketing", marketer, `mk2@${D}`, members, NOW), /unlock|approved/);
  assert.throws(() => assignTask(ok, "marketing", av, `mk2@${D}`, members, NOW), /Only the Marketing team/);
  assert.throws(() => assignTask(ok, "marketing", marketer, `av@${D}`, members, NOW), /isn't on the Marketing team/);
  const given = assignTask(ok, "marketing", marketer, `MK2@${D}`, members, NOW);
  const t = given.event.tasks!.find((x) => x.id === "marketing")!;
  assert.equal(t.assignee, `mk2@${D}`);
  assert.equal(t.status, "todo", "handing it over doesn't start it");
  assert.equal(t.history.at(-1)?.action, `Assigned to mk2@${D}`);
  assert.deepEqual(taskNotices(given, "marketing", marketer, "assign").map((n) => ["email" in n.to ? n.to.email : "", n.alert]), [[`mk2@${D}`, true]]);
  const back = assignTask(given, "marketing", marketer, marketer.email, members, NOW);
  assert.equal(back.event.tasks!.find((x) => x.id === "marketing")!.history.at(-1)?.action, `Handed from mk2@${D} to themselves`);
  assert.deepEqual(taskNotices(back, "marketing", marketer, "assign"), [], "taking it yourself tells nobody");
  assert.throws(() => assignTask(back, "marketing", marketer, marketer.email, members, NOW), /already have/);
  assert.throws(() => assignTask(actOnTask(back, "marketing", marketer, "done", NOW), "marketing", marketer, `mk2@${D}`, members, NOW), /already done/);
});

test("images: the requester and marketing add images to a public event; its stage doesn't change", () => {
  const ok = approved(full());
  assert.equal(imagesPermission(ok, owner).ok, true);
  assert.equal(imagesPermission(ok, marketer).ok, true);
  assert.equal(imagesPermission(ok, av).ok, false);
  assert.equal(imagesPermission(approved(base()), owner).ok, false, "only public events");
  const added = addImages(ok, owner, NOW, [{ name: "flyer.png", size: 1000 }]);
  assert.deepEqual(added.event.images?.map((f) => [f.name, f.by]), [["flyer.png", owner.email]]);
  assert.equal(added.status, ok.status);
  assert.equal(added.event.history.at(-1)?.action, "Added 1 image for marketing");
  // A resubmitted request keeps its images.
  const kept = wf.resubmit(addImages(wf.returnForChanges(submitted(full()), exec, [], NOW, "Fix the time"), owner, NOW, [{ name: "a.jpg", size: 1 }]), full(), owner, [], NOW, []);
  assert.equal(kept.event.images?.length, 1);
  // An older request's Drive link isn't on the form any more; resubmitting keeps it.
  const old = wf.newEvent(full({ brief: { ...brief, files: "https://drive.google.com/old" } }), owner, NOW, []);
  const sentBack = wf.returnForChanges(wf.submit({ ...old, id: "EV-9" }, owner, [], NOW), exec, [], NOW, "Fix the time");
  assert.equal(wf.resubmit(sentBack, full(), owner, [], NOW, []).event.brief?.files, "https://drive.google.com/old");
});

test("tasks: re-approval after a move keeps work already done", () => {
  const ok = approved(full());
  const done = actOnTask(ok, "av", av, "done", NOW, "Projector tested");
  const moved = wf.releaseToMove(done, [], NOW, "SR-1002", done.event.dates);
  const back = wf.resubmit(moved, { ...moved.event, date: "2026-11-21" }, owner, [], NOW, []);
  assert.equal(back.status, "approved");
  assert.equal(back.event.tasks!.find((t) => t.id === "av")!.status, "done");
  assert.equal(back.event.tasks!.find((t) => t.id === "marketing")!.dueDate, "2026-11-21", "due dates follow the new date");
});

test("tasks: only the team (or the office) works them; take, start, done, and a question for the requester", () => {
  const ok = approved(full());
  assert.equal(taskPermission(ok, "av", marketer, "take").ok, false);
  assert.equal(taskPermission(submitted(full()), "av", av, "take").ok, false, "locked before approval");
  assert.throws(() => actOnTask(ok, "av", marketer, "start", NOW), TaskError);

  const taken = actOnTask(ok, "av", av, "take", NOW);
  assert.equal(taken.event.tasks!.find((t) => t.id === "av")!.assignee, av.email);
  assert.throws(() => actOnTask(taken, "av", av2, "take", NOW), /already took/);
  const started = actOnTask(taken, "av", av, "start", NOW);
  assert.equal(started.event.tasks!.find((t) => t.id === "av")!.status, "doing");
  const done = actOnTask(started, "av", av2, "done", NOW, "Two mics set up");
  const t = done.event.tasks!.find((x) => x.id === "av")!;
  assert.equal(t.status, "done");
  assert.equal(t.note, "Two mics set up");
  assert.equal(t.history.length, 4);
  assert.ok(done.event.history.some((h) => /A\/V task: done/.test(h.action)));
  assert.throws(() => actOnTask(done, "av", av, "start", NOW), /already done/);
  assert.deepEqual(taskNotices(done, "av", av2, "done", "Two mics set up").map((n) => ["email" in n.to ? n.to.email : "", n.alert]), [[owner.email, false]]);

  assert.throws(() => actOnTask(ok, "marketing", marketer, "ask", NOW, "  "), /question/);
  const asked = actOnTask(ok, "marketing", { ...marketer, name: "Marketing Volunteer" }, "ask", NOW, "Can you send the logo?");
  assert.equal(asked.comments?.length, 1);
  assert.match(asked.comments![0].text, /Can you send the logo/);
  assert.deepEqual(taskNotices(asked, "marketing", marketer, "ask", "Can you send the logo?").map((n) => n.alert), [true]);
  assert.equal(actOnTask(ok, "marketing", office, "done", NOW).event.tasks!.find((x) => x.id === "marketing")!.status, "done", "the office can work any task");
  assert.ok(!planTasks(ok.event).some((x) => (x.team as string) === "facilities"), "committees set up themselves: no facilities task");
});

// ---- Queues -------------------------------------------------------------------

test("queues: old Team Queues links go to each team's page; open tasks soonest first", () => {
  assert.equal(retiredQueueHref("marketing", ["member", "av"]), "/marketing?view=team", "the team in the link wins");
  assert.equal(retiredQueueHref("av", ["member", "marketing"]), "/it-maintenance?view=team");
  assert.equal(retiredQueueHref(undefined, ["member", "marketing"]), "/marketing?view=team", "marketing-only people go to Team work");
  assert.equal(retiredQueueHref(undefined, ["member", "marketing", "av"]), "/it-maintenance?view=team");
  assert.equal(retiredQueueHref(undefined, ["member", "it", "av"]), "/it-maintenance?view=team");
  assert.equal(retiredQueueHref("security", ["member", "office", "marketing"]), "/it-maintenance?view=team", "the office, and old team names, go to IT & Maintenance");
  assert.equal(retiredQueueHref(undefined, ["member"]), "/it-maintenance?view=team");
  assert.equal(TEAM_WORK_HREF.av, "/it-maintenance?view=team");
  const sub = submitted(full());
  const avAlert = taskUnlockNotices(sub, wf.approve(sub, exec, [], NOW)).find((x) => "role" in x.to && x.to.role === "av");
  assert.equal(avAlert?.href, "/it-maintenance?view=team", "A/V alerts open IT & Maintenance");

  const later = approved(full({ date: "2026-12-05" }));
  const sooner = approved(full({ date: "2026-11-07" }));
  const finished = actOnTask(approved(full()), "av", av, "done", NOW);
  const pending = submitted(full());
  const cards = [later, sooner, finished, pending];
  const avq = queueItems(cards, "av", "2026-10-23");
  assert.deepEqual(avq.map((x) => x.card.id), [sooner.id, later.id], "done and locked tasks aren't in the queue");
  const mk = queueItems(cards, "marketing", "2026-10-23");
  assert.equal(mk[0].card.id, sooner.id);
  assert.equal(mk[0].overdue, false, "marketing is due by the event, Nov 7");
  assert.equal(lockedCount(cards, "av"), 1);
  assert.deepEqual(recentlyDone(cards, "av").map((x) => x.card.id), [finished.id]);

  const farther = approved(full({ date: "2026-12-19" }));
  const all = queueItems([later, sooner, farther], "av", "2026-10-23");
  const near = nearTerm(all, "2026-11-06");
  assert.deepEqual(near.map((x) => x.task.dueDate), ["2026-11-07", "2026-12-05", "2026-12-19"], "each event's next task shows, even past two weeks");
});

// ---- Run sheet -----------------------------------------------------------------

test("run sheet: the day's approved events by time, with setup and cleanup; other calendar entries marked; one campus at a time", () => {
  const night = approved(base({ title: "Game Night", rooms: ["mphA"], start: "19:00", end: "22:00", food: true, attendance: 120, setupNotes: "Tables in rows", av: true, avNeeds: { kinds: ["sound"], includes: [], ack: true } }));
  const morning = approved(base({ title: "Breakfast", rooms: ["r250"], start: "09:00", end: "10:00", setup: 0, teardown: 15 }));
  const other = approved(base({ title: "Elsewhere", rooms: ["pr1"] }));
  const pending = submitted(base({ title: "Not yet", rooms: ["mphB"] }));
  const offDay = approved(base({ title: "Other day", date: "2026-11-15" }));
  const busy: BusyItem[] = [
    { roomId: "mphA", date: "2026-11-14", start: "18:30", end: "22:30", label: "Game Night", kind: "booking", cardId: night.id },
    { roomId: "mphA", date: "2026-11-14", start: "12:30", end: "14:30", label: "Jumuah", kind: "booking", eventId: "j1" },
    { roomId: "mphB", date: "2026-11-14", start: "12:30", end: "14:30", label: "Jumuah", kind: "booking", eventId: "j2" },
    { roomId: "mphB", date: "2026-11-14", start: "17:00", end: "19:00", label: "Not yet", kind: "pending", cardId: pending.id },
    { roomId: "r250", date: "2026-11-14", start: "15:00", end: "16:00", label: "Quran class", kind: "booking", eventId: "q1" },
    { roomId: "pr1", date: "2026-11-14", start: "15:00", end: "16:00", label: "Page Road class", kind: "booking", eventId: "p1" },
  ];
  assert.deepEqual(campusesOf(rooms), ["Main campus", "Page Road"]);
  const rows = runSheetRows([night, morning, other, pending, offDay], busy, rooms, "2026-11-14", "Main campus");
  assert.deepEqual(rows.map((r) => [r.kind, r.title, r.start, r.end]), [
    ["event", "Breakfast", "09:00", "10:15"],
    ["calendar", "Jumuah", "12:30", "14:30"],
    ["calendar", "Quran class", "15:00", "16:00"],
    ["event", "Game Night", "18:30", "22:30"],
  ]);
  const jumuah = rows[1];
  assert.ok(jumuah.kind === "calendar" && jumuah.rooms.length === 2, "one row for an entry on several rooms");
  const gn = rows[3];
  assert.ok(gn.kind === "event");
  if (gn.kind === "event") {
    assert.equal(gn.afterHours, true);
    assert.equal(gn.contact, owner.email);
    assert.equal(gn.av, "Sound system support");
    assert.deepEqual(gn.notes, ["Food served.", "Large crowd: help with parking."]);
  }
  assert.deepEqual(runSheetRows([night, other], busy, rooms, "2026-11-14", "Page Road").map((r) => r.title), ["Page Road class", "Elsewhere"]);
});

// ---- Close-out ---------------------------------------------------------------------

test("close-out: after the last date it waits on the requester, with a reminder a week later", () => {
  const ok = approved();
  assert.equal(dueForCloseOut(ok, "2026-11-14"), false, "not on the day itself");
  assert.equal(dueForCloseOut(ok, "2026-11-15"), true);
  const series = approved(base({ date: "2026-11-03", recur: { freq: "weekly", until: "2026-11-24" } }));
  assert.equal(dueForCloseOut(series, "2026-11-20"), false, "a series closes out after its last date");

  const co = startCloseOut(ok, "2026-11-15T11:00:00Z");
  assert.equal(co.status, "close_out");
  assert.equal(co.waitingOn, "You: attendance and final costs");
  assert.equal(wf.holdsWanted(co), "confirmed");
  assert.deepEqual(closeOutNotices(ok, co, null).map((n) => ["email" in n.to ? n.to.email : "", n.alert]), [[owner.email, false]]);
  assert.equal(needsNudge(co, "2026-11-21"), false);
  assert.equal(needsNudge(co, "2026-11-22"), true);
  const nudged = markNudged(co, "2026-11-22T11:00:00Z");
  assert.equal(needsNudge(nudged, "2026-11-29"), false, "only once");
  assert.deepEqual(closeOutNotices(co, nudged, null).map((n) => n.alert), [true]);
});

test("close-out: the requester gives attendance and confirms costs; the office can close it for them; deposits go to finance", () => {
  const co = startCloseOut(approved(), NOW);
  const stranger: wf.EventActor = { email: `vol@${D}`, name: "Volunteer", roles: ["member"] };
  assert.equal(closeOutPermission(co, stranger).ok, false);
  assert.equal(closeOutPermission(approved(), owner).ok, false);
  assert.throws(() => submitCloseOut(co, owner, NOW, { attendance: "", notes: "", costsConfirmed: true }, 0), /how many/);
  assert.throws(() => submitCloseOut(co, owner, NOW, { attendance: "40", notes: "", costsConfirmed: false }, 0), /Confirm the final costs/);
  assert.throws(() => submitCloseOut(co, owner, NOW, { attendance: "-3", notes: "", costsConfirmed: true }, 0), /whole number/);

  const closed = submitCloseOut(co, owner, NOW, { attendance: "42", notes: "Good turnout", costsConfirmed: true, depositRefund: true }, 310.5);
  assert.equal(closed.status, "closed");
  assert.equal(closed.event.stage, "done");
  assert.deepEqual([closed.event.closeOut?.attendance, closed.event.closeOut?.spent, closed.event.closeOut?.depositRefund], [42, 310.5, undefined], "only the office marks a deposit refund");
  assert.deepEqual(closeOutNotices(co, closed, owner), []);
  assert.throws(() => submitCloseOut(closed, owner, NOW, { attendance: "1", notes: "", costsConfirmed: true }, 0), /already closed/);

  const byOffice = submitCloseOut(co, office, NOW, { attendance: "", notes: "", costsConfirmed: false, depositRefund: true }, 0);
  assert.equal(byOffice.status, "closed");
  assert.equal(byOffice.event.closeOut?.byOffice, true);
  assert.deepEqual(closeOutNotices(co, byOffice, office).map((n) => ["role" in n.to ? n.to.role : n.to.email, n.alert]), [[owner.email, false], ["finance", true]]);
});

test("close-out: actual spend is the linked purchases that weren't cancelled or rejected", () => {
  const po = (id: string, status: string, eventCardId: string | undefined, amount: number) =>
    ({ id, type: "purchase", status, purchase: { eventCardId, lines: [{ id: "L1", accountId: "a38", amount, hasReceipt: true }] } }) as unknown as Card;
  const cards = [po("PO-1", "in_review", "EV-1", 100.25), po("PO-2", "paid", "EV-1", 50), po("PO-3", "cancelled", "EV-1", 999), po("PO-4", "denied", "EV-1", 999), po("PO-5", "paid", "EV-2", 20), po("PO-6", "paid", undefined, 20)];
  const linked = linkedPurchases(cards, "EV-1");
  assert.deepEqual(linked.map((c) => c.id), ["PO-1", "PO-2"]);
  assert.equal(spendOf(linked), 150.25);
});

// ---- Linking a purchase to an event --------------------------------------------------

test("purchase link: your own approved events and your committees' upcoming ones; the form only accepts those", () => {
  const mine = approved(base({ title: "Mine" }));
  const mineDone = startCloseOut(approved(base({ title: "Mine, over", date: "2026-10-10" })), NOW);
  const committee = { ...approved(base({ title: "Committee's" })), ownerEmail: `other@${D}` };
  const committeePast = { ...approved(base({ title: "Committee's, past", date: "2026-10-01" })), ownerEmail: `other@${D}` };
  const otherCommittee = { ...approved(base({ title: "Other committee", committeeGroup: `portal-team-women@${D}` })), ownerEmail: `other@${D}` };
  const notApproved = submitted(base({ title: "In review" }));
  const choices = linkableEvents([mine, mineDone, committee, committeePast, otherCommittee, notApproved], { email: owner.email, groups: [`portal-team-youth@${D}`] }, "2026-10-23");
  assert.deepEqual(choices.map((c) => c.id).sort(), [mine.id, mineDone.id, committee.id].sort());
  assert.ok(choices.find((c) => c.id === mineDone.id)!.label.includes("closing out"));

  const input = (eventCardId?: string): PurchaseInput => ({ kind: "reimburse", fund: "Youth Expenses", description: "Game night snacks", delivery: "mail", mailingAddress: "1 Main St, Raleigh NC 27601", lines: [{ accountId: "a38", amount: "25" }], attestationName: "Youth Chair", eventCardId });
  const ctx = { requesterName: "Youth Chair", cards: [], vendors: [], events: [mine.id] };
  const ok = parsePurchaseInput(input(mine.id), ctx);
  assert.ok(ok.ok && ok.details.eventCardId === mine.id);
  const none = parsePurchaseInput(input(""), ctx);
  assert.ok(none.ok && none.details.eventCardId === undefined);
  const notOffered = parsePurchaseInput(input(otherCommittee.id), ctx);
  assert.equal(notOffered.ok, false);
  if (!notOffered.ok) assert.match(notOffered.errors.join(" "), /Choose one of your events/);
  assert.equal(parsePurchaseInput(input("PO-12001"), { ...ctx, events: undefined }).ok, false, "only event cards");
});
