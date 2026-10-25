/**
 * IT & Maintenance rules. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canOpenCard } from "../access";
import { withComment } from "../comments";
import { ORG } from "../org";
import type { Directory } from "../teams";
import { canViewTicket } from "./access";
import { checkPhotos, parseTicketInput } from "./input";
import { jiraStatus, jiraTeam, jiraUrgency, parseCsv, parseJiraDate, planCounts, planJiraImport, readJiraCsv, type JiraContext } from "./jira";
import { reminderNotices, ticketCommentNotices, ticketNotices } from "./notices";
import { addFrequency, afterOpening, dueSchedules, nextAfter, parseScheduleInput, ticketFromSchedule, type TicketSchedule } from "./schedules";
import * as wf from "./workflow";
import { WorkflowError } from "../workflow-core";

const d = ORG.domain;
const reporter: wf.TicketActor = { email: `vol@${d}`, name: "Vol Unteer", roles: ["member"] };
const fac: wf.TicketActor = { email: `fac@${d}`, name: "Fac Staff", roles: ["member", "facilities"] };
const fac2: wf.TicketActor = { email: `fac2@${d}`, name: "Fac Two", roles: ["member", "facilities"] };
const facLead: wf.TicketActor = { email: `faclead@${d}`, name: "Fac Chair", roles: ["member", "facilities", "chairs"], leads: ["facilities"] };
const itTech: wf.TicketActor = { email: `it@${d}`, name: "IT Tech", roles: ["member", "it", "av"] };
const office: wf.TicketActor = { email: `office@${d}`, name: "Office", roles: ["member", "office"] };
const admin: wf.TicketActor = { email: `admin@${d}`, name: "Admin", roles: ["member", "admins"] };
const members = [fac.email, fac2.email, facLead.email];

const T = (h: number) => new Date(Date.UTC(2026, 9, 1, 12) + h * 36e5).toISOString();

function reported(over: Partial<wf.NewTicketInput> = {}, by = reporter): wf.TicketCard {
  const c = wf.newTicket({ team: "facilities", kind: "request", title: "Faucet drips", room: "Women's Prayer Hall", urgency: "normal", description: "Left faucet drips.", ...over }, by, T(0));
  c.id = "TK-1001";
  return c;
}

const throws = (fn: () => unknown, re?: RegExp) => assert.throws(fn, (e: unknown) => e instanceof WorkflowError && (!re || re.test(e.message)));

// ---- Workflow -------------------------------------------------------------------

test("new ticket: status new, the reporter follows it, waiting on the team, searchable by room", () => {
  const c = reported({ equipment: "Faucet" });
  assert.equal(c.ticket.status, "new");
  assert.equal(c.status, "submitted");
  assert.deepEqual(c.ticket.watchers, [reporter.email]);
  assert.equal(c.committee, "Facility Maintenance");
  assert.match(c.waitingOn!, /Facilities team: pick it up/);
  assert.match(c.searchText!, /Women's Prayer Hall/);
  assert.match(c.searchText!, /Faucet/);
  assert.equal(c.ticket.history.length, 1);
});

test("full path: assign → start → waiting on parts → start → resolve → reporter confirms", () => {
  let c = reported();
  c = wf.assign(c, fac, T(1), fac.email, members);
  assert.equal(c.ticket.status, "assigned");
  assert.equal(c.status, "in_review");
  assert.equal(c.ticket.firstResponseAt, T(1));
  assert.ok(c.ticket.watchers.includes(fac.email));
  c = wf.start(c, fac, T(2));
  assert.equal(c.ticket.status, "in_progress");
  c = wf.waitForParts(c, fac, T(3), "Cartridge on order");
  assert.equal(c.ticket.status, "waiting_parts");
  assert.match(c.waitingOn!, /waiting on parts/);
  c = wf.start(c, fac, T(30));
  assert.equal(c.ticket.history.at(-1)!.action, "Parts are in; back to work");
  c = wf.resolve(c, fac, T(31), "Replaced the cartridge.");
  assert.equal(c.ticket.status, "resolved");
  assert.equal(c.status, "close_out");
  assert.equal(c.ticket.resolvedAt, T(31));
  assert.match(c.waitingOn!, /^You: /);
  c = wf.confirm(c, reporter, T(40));
  assert.equal(c.ticket.status, "closed");
  assert.equal(c.status, "closed");
  assert.equal(c.waitingOn, undefined);
  assert.equal(c.ticket.history.length, 7);
  assert.equal(c.ticket.firstResponseAt, T(1), "first response is kept");
});

test("start on an unassigned ticket assigns whoever starts it", () => {
  const c = wf.start(reported(), fac2, T(1));
  assert.equal(c.ticket.assigneeEmail, fac2.email);
  assert.equal(c.ticket.status, "in_progress");
  assert.deepEqual(c.ticket.history.slice(1).map((h) => h.action), ["Picked it up", "Started work"]);
});

test("assign: only team members or the office; only to someone on the team's Google Group", () => {
  const c = reported();
  throws(() => wf.assign(c, reporter, T(1), fac.email, members), /Only the Facilities team or the IAR office/);
  throws(() => wf.assign(c, itTech, T(1), fac.email, members), /Only the Facilities team/);
  throws(() => wf.assign(c, admin, T(1), fac.email, members), /Only the Facilities team/);
  throws(() => wf.assign(c, fac, T(1), `stranger@${d}`, members), /isn't on the Facilities team's Google Group/);
  const byOffice = wf.assign(c, office, T(1), fac2.email, members);
  assert.equal(byOffice.ticket.assigneeEmail, fac2.email);
  assert.equal(wf.assign(c, fac, T(1), fac2.email, members).ticket.history.at(-1)!.action, `Assigned to ${fac2.email}`);
  assert.equal(wf.assign(c, fac, T(1), fac.email, members).ticket.history.at(-1)!.action, "Picked it up");
});

test("reassign: the assignee, the team's chairs and the office can; other team members can't", () => {
  const c = wf.assign(reported(), fac, T(1), fac.email, members);
  throws(() => wf.assign(c, fac2, T(2), fac2.email, members), /It's assigned to fac@/);
  assert.equal(wf.assign(c, fac, T(2), fac2.email, members).ticket.assigneeEmail, fac2.email);
  const byLead = wf.assign(c, facLead, T(2), fac2.email, members);
  assert.match(byLead.ticket.history.at(-1)!.action, /Handed from fac@.* to fac2@/);
  assert.equal(wf.assign(c, office, T(2), fac2.email, members).ticket.assigneeEmail, fac2.email);
  throws(() => wf.assign(c, fac, T(2), fac.email, members), /already assigned to you/);
  // Reassigning work in progress keeps its status.
  const working = wf.start(c, fac, T(3));
  assert.equal(wf.assign(working, facLead, T(4), fac2.email, members).ticket.status, "in_progress");
});

test("work actions: anyone on the ticket's team; not the reporter, other teams, the office or admins", () => {
  const c = reported();
  for (const a of [reporter, itTech, office, admin]) {
    assert.equal(wf.permission(c, a, "start").ok, false, a.email);
    assert.equal(wf.permission(c, a, "resolve").ok, false, a.email);
    assert.equal(wf.permission(c, a, "wait").ok, false, a.email);
  }
  assert.ok(wf.permission(c, fac2, "resolve").ok);
  const itTicket = reported({ team: "it" });
  assert.ok(wf.permission(itTicket, itTech, "start").ok);
  assert.ok(wf.permission(itTicket, { ...itTech, roles: ["member", "av"] }, "start").ok, "A/V counts as the IT team");
  assert.equal(wf.permission(itTicket, fac, "start").ok, false);
});

test("resolve needs a note; preventive tickets close straight away", () => {
  throws(() => wf.resolve(reported(), fac, T(1), "  "), /Say what was done/);
  const s: TicketSchedule = schedule({ assigneeEmail: fac.email });
  const p = ticketFromSchedule(s, T(0));
  p.id = "TK-2000";
  const done = wf.resolve(p, fac, T(2), "Filters replaced.");
  assert.equal(done.ticket.status, "closed");
  assert.equal(done.ticket.closedAt, T(2));
  assert.equal(done.ticket.history.at(-1)!.action, "Done");
});

test("reporter: confirm or reopen once marked fixed; reopen needs a reason and goes back to the assignee", () => {
  let c = wf.assign(reported(), fac, T(1), fac.email, members);
  throws(() => wf.confirm(c, reporter, T(2)), /hasn't marked this fixed/);
  c = wf.resolve(c, fac, T(3), "Tightened it.");
  throws(() => wf.confirm(c, fac, T(4)), /Only the person who reported/);
  throws(() => wf.reopen(c, reporter, T(4), ""), /Say what's still wrong/);
  throws(() => wf.start(c, fac, T(4)), /waiting for the reporter/);
  const r = wf.reopen(c, reporter, T(4), "Still drips at night.");
  assert.equal(r.ticket.status, "reopened");
  assert.equal(r.ticket.assigneeEmail, fac.email);
  assert.equal(r.ticket.resolvedAt, undefined);
  assert.equal(r.status, "in_review");
  assert.match(r.waitingOn!, /reopened/);
  // Back to work from reopened.
  assert.equal(wf.start(r, fac, T(5)).ticket.status, "in_progress");
});

test("cancel: only the reporter, only while new; closed tickets accept nothing", () => {
  const c = reported();
  throws(() => wf.cancel(c, fac, T(1)), /Only the person who reported/);
  const x = wf.cancel(c, reporter, T(1));
  assert.equal(x.status, "cancelled");
  throws(() => wf.start(x, fac, T(2)), /cancelled/);
  const picked = wf.assign(c, fac, T(1), fac.email, members);
  throws(() => wf.cancel(picked, reporter, T(2)), /already picked this up/);
});

test("target date and photos; following and unfollowing", () => {
  let c = reported();
  throws(() => wf.setDueDate(c, reporter, T(1), "2026-10-10"), /Only the Facilities team/);
  c = wf.setDueDate(c, office, T(1), "2026-10-10");
  assert.equal(c.ticket.dueDate, "2026-10-10");
  throws(() => wf.setDueDate(c, fac, T(1), "soon"), /Pick a date/);
  c = wf.addPhotos(c, reporter, T(2), [{ name: "leak.jpg", size: 1000, at: T(2), by: reporter.email }]);
  assert.equal(c.ticket.photos.length, 1);
  assert.equal(wf.permission(c, office, "photos").ok, false);
  c = wf.setWatching(c, office.email, true, T(3));
  assert.ok(wf.isWatching(c, office.email));
  throws(() => wf.setWatching(c, office.email, true, T(3)), /already following/);
  throws(() => wf.setWatching(c, reporter.email, false, T(3)), /always hear/);
  assert.equal(wf.isWatching(wf.setWatching(c, office.email, false, T(4)), office.email), false);
});

test("teams: leads and members come from the Google Groups", () => {
  const dir: Directory = {
    teams: [{ email: wf.teamGroup("facilities"), name: "Facility Maintenance", members: [{ email: "A@x.org", role: "OWNER", type: "USER" }, { email: "b@x.org", role: "MEMBER", type: "USER" }, { email: "sub@x.org", role: "MEMBER", type: "GROUP" }] }],
    pillars: [],
  };
  assert.deepEqual(wf.teamMemberEmails(dir, "facilities"), ["a@x.org", "b@x.org"]);
  assert.deepEqual(wf.teamMemberEmails(dir, "it"), []);
  assert.deepEqual(wf.leadsOf([{ name: "Facility Maintenance", group: wf.teamGroup("facilities"), role: "vice" }, { name: "IT Services", group: wf.teamGroup("it"), role: "member" }]), ["facilities"]);
  assert.equal(wf.canImportJira({ roles: ["member", "admins"] }), true);
  assert.equal(wf.canImportJira(facLead), true);
  assert.equal(wf.canImportJira(fac), false);
  assert.deepEqual(wf.teamsOf(itTech), ["it"]);
});

// ---- Visibility -------------------------------------------------------------------

test("visibility: reporter, followers, the ticket's team, office, admins; not other members or the other team", () => {
  const c = wf.setWatching(reported(), `watcher@${d}`, true, T(1));
  const see = (v: wf.TicketActor & { seeAll?: boolean }) => canViewTicket(c, v);
  assert.ok(see(reporter));
  assert.ok(see(fac));
  assert.ok(see(office));
  assert.ok(see({ ...admin, seeAll: true }));
  assert.ok(see({ email: `watcher@${d}`, name: "W", roles: ["member"] }));
  assert.equal(see({ email: `other@${d}`, name: "O", roles: ["member", "chairs"] }), false);
  assert.equal(see(itTech), false);
  assert.equal(see(admin), false, "admins see only with seeAll");
  assert.equal(canOpenCard(c, itTech), false);
  assert.ok(canOpenCard(c, fac));
});

// ---- Notices ------------------------------------------------------------------------

test("notices: a new ticket alerts the team's Chat space; urgent says so first", () => {
  const n = ticketNotices(null, reported(), reporter);
  assert.equal(n.length, 1);
  assert.deepEqual(n[0].to, { role: "facilities" });
  assert.equal(n[0].alert, true);
  assert.equal(n[0].href, "/it-maintenance/TK-1001");
  const u = ticketNotices(null, reported({ urgency: "urgent", team: "it" }), reporter);
  assert.deepEqual(u[0].to, { role: "it" });
  assert.match(u[0].text, /^Urgent: /);
});

test("notices: assigned alerts the assignee, and tells the reporter without an alert; picking it up yourself sends you nothing", () => {
  const c = reported();
  const a = wf.assign(c, facLead, T(1), fac.email, members);
  const n = ticketNotices(c, a, facLead);
  assert.deepEqual(n.map((x) => [x.to, x.alert]), [[{ email: fac.email }, true], [{ email: reporter.email }, false]]);
  const self = wf.assign(c, fac, T(1), fac.email, members);
  assert.deepEqual(ticketNotices(c, self, fac).map((x) => x.to), [{ email: reporter.email }]);
});

test("notices: in progress and waiting on parts tell the reporter without alerts; fixed alerts the reporter to confirm", () => {
  const a = wf.assign(reported(), fac, T(1), fac.email, members);
  const s = wf.start(a, fac, T(2));
  assert.deepEqual(ticketNotices(a, s, fac).map((x) => [x.to, x.alert]), [[{ email: reporter.email }, false]]);
  const w = wf.waitForParts(s, fac, T(3), "Part due Friday");
  const wn = ticketNotices(s, w, fac);
  assert.equal(wn[0].alert, false);
  assert.match(wn[0].text, /Part due Friday/);
  const r = wf.resolve(w, fac, T(4), "Fixed it.");
  const rn = ticketNotices(w, r, fac);
  assert.deepEqual(rn.map((x) => [x.to, x.alert]), [[{ email: reporter.email }, true]]);
  assert.match(rn[0].text, /confirm/);
  // Followers hear too, without alerts.
  const watched = wf.setWatching(w, office.email, true, T(4));
  const r2 = wf.resolve(watched, fac, T(5), "Fixed it.");
  assert.deepEqual(ticketNotices(watched, r2, fac).map((x) => [x.to, x.alert]), [[{ email: reporter.email }, true], [{ email: office.email }, false]]);
});

test("notices: reopened alerts the assignee, or the team when nobody has it; confirmed and cancelled are quiet", () => {
  const r = wf.resolve(wf.assign(reported(), fac, T(1), fac.email, members), fac, T(2), "Done.");
  const o = wf.reopen(r, reporter, T(3), "Still broken");
  assert.deepEqual(ticketNotices(r, o, reporter).map((x) => [x.to, x.alert]), [[{ email: fac.email }, true]]);
  const r2 = wf.resolve(reported(), fac, T(2), "Done.");
  const unassigned = { ...r2, ticket: { ...r2.ticket, assigneeEmail: undefined } };
  const o2 = wf.reopen(unassigned, reporter, T(3), "No");
  assert.deepEqual(ticketNotices(unassigned, o2, reporter)[0].to, { role: "facilities" });
  const ok = wf.confirm(r, reporter, T(3));
  assert.deepEqual(ticketNotices(r, ok, reporter).map((x) => [x.to, x.alert]), [[{ email: fac.email }, false]]);
  const c = reported();
  assert.deepEqual(ticketNotices(c, wf.cancel(c, reporter, T(1)), reporter).map((x) => [x.to, x.alert]), [[{ role: "facilities" }, false]]);
});

test("notices: comments go to the reporter, assignee, followers and earlier commenters, never as alerts", () => {
  let c = wf.assign(reported(), fac, T(1), fac.email, members);
  c = wf.setWatching(c, office.email, true, T(2));
  c = withComment(c, { at: T(3), by: `earlier@${d}`, name: "Earlier", text: "Same in the men's side." });
  const n = ticketCommentNotices(c, reporter, "Any news?");
  assert.deepEqual(n.map((x) => x.to), [{ email: fac.email }, { email: office.email }, { email: `earlier@${d}` }]);
  assert.ok(n.every((x) => !x.alert && x.href.endsWith("#comments")));
  // Nobody has it yet: the team's queue hears.
  assert.deepEqual(ticketCommentNotices(reported(), reporter, "More detail").map((x) => x.to), [{ role: "facilities" }]);
});

// ---- The daily job's decisions ----------------------------------------------------------

test("daily: resolved tickets close themselves after 7 days, with a history entry", () => {
  const r = wf.resolve(reported(), fac, T(0), "Done.");
  assert.equal(wf.shouldAutoClose(r, new Date(Date.parse(T(0)) + 6.9 * 864e5)), false);
  const at = new Date(Date.parse(T(0)) + 7 * 864e5);
  assert.ok(wf.shouldAutoClose(r, at));
  const c = wf.autoClose(r, at);
  assert.equal(c.ticket.status, "closed");
  assert.equal(c.ticket.history.at(-1)!.by, wf.SYSTEM);
  const n = ticketNotices(r, c, { email: wf.SYSTEM });
  assert.deepEqual(n.map((x) => [x.to, x.alert]), [[{ email: reporter.email }, false]]);
  assert.equal(wf.shouldAutoClose(wf.reopen(r, reporter, T(1), "no"), at), false);
});

test("daily: one reminder for high and urgent tickets nobody started past their response time", () => {
  const high = reported({ urgency: "high" });
  assert.equal(wf.needsReminder(high, new Date(Date.parse(T(7)))), false);
  const late = new Date(Date.parse(T(9)));
  assert.ok(wf.needsReminder(high, late));
  assert.equal(wf.needsReminder(reported({ urgency: "normal" }), new Date(Date.parse(T(100)))), false, "normal urgency is never chased");
  const m = wf.markReminded(high, late);
  assert.equal(wf.needsReminder(m, new Date(Date.parse(T(50)))), false, "only once");
  assert.deepEqual(reminderNotices(m, { email: wf.SYSTEM }).map((x) => [x.to, x.alert]), [[{ role: "facilities" }, true]]);
  // Assigned but not started still counts, and the reminder goes to the assignee.
  const assigned = wf.assign(reported({ urgency: "urgent" }), fac, T(0), fac.email, members);
  assert.ok(wf.needsReminder(assigned, new Date(Date.parse(T(3)))));
  assert.deepEqual(reminderNotices(assigned, { email: wf.SYSTEM })[0].to, { email: fac.email });
  // Started: no reminder. Reopened later: it can be reminded again.
  assert.equal(wf.needsReminder(wf.start(assigned, fac, T(1)), new Date(Date.parse(T(50)))), false);
  const again = wf.reopen(wf.resolve(wf.markReminded(assigned, new Date(Date.parse(T(3)))), fac, T(4), "ok"), reporter, T(5), "no");
  assert.ok(wf.needsReminder(again, new Date(Date.parse(T(8)))));
});

test("overdue: past the target date, or not started past the response time", () => {
  const c = wf.setDueDate(wf.start(reported(), fac, T(0)), fac, T(0), "2026-10-03");
  assert.equal(wf.isOverdue(c, new Date(Date.parse(T(1))), "2026-10-03"), false);
  assert.ok(wf.isOverdue(c, new Date(Date.parse(T(1))), "2026-10-04"));
  assert.ok(wf.isOverdue(reported({ urgency: "low" }), new Date(Date.parse(T(73))), "2026-10-01"));
});

// ---- Schedules ----------------------------------------------------------------------------

function schedule(over: Partial<TicketSchedule> = {}): TicketSchedule {
  return { id: "PM-1", team: "facilities", name: "HVAC filter check", frequency: "monthly", next: "2026-10-05", room: "Main Prayer Hall", urgency: "normal", paused: false, createdBy: fac.email, createdAt: T(0), updatedAt: T(0), ...over };
}

test("schedules: next dates by frequency, keeping the day or the month's last day", () => {
  assert.equal(addFrequency("2026-10-05", "weekly"), "2026-10-12");
  assert.equal(addFrequency("2026-12-29", "weekly"), "2027-01-05");
  assert.equal(addFrequency("2026-10-05", "monthly"), "2026-11-05");
  assert.equal(addFrequency("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(addFrequency("2026-11-30", "quarterly"), "2027-02-28");
  assert.equal(addFrequency("2026-10-05", "semiannual"), "2027-04-05");
  assert.equal(addFrequency("2028-02-29", "yearly"), "2029-02-28");
  // Missed dates are skipped, not piled up.
  assert.equal(nextAfter("2026-07-05", "monthly", "2026-10-05"), "2026-11-05");
  assert.equal(nextAfter("2026-10-05", "weekly", "2026-10-05"), "2026-10-12");
});

test("schedules: due ones open a preventive ticket owned by the team's group, then move on", () => {
  const list = [schedule(), schedule({ id: "PM-2", next: "2026-10-06" }), schedule({ id: "PM-3", paused: true, next: "2026-09-01" })];
  assert.deepEqual(dueSchedules(list, "2026-10-05").map((s) => s.id), ["PM-1"]);
  const t = ticketFromSchedule(schedule({ assigneeEmail: fac.email }), T(0));
  assert.equal(t.ticket.kind, "preventive");
  assert.equal(t.ticket.status, "assigned");
  assert.equal(t.ticket.dueDate, "2026-10-05");
  assert.equal(t.ticket.scheduleId, "PM-1");
  assert.equal(t.ownerEmail, wf.teamGroup("facilities"));
  assert.match(t.title, /HVAC filter check – Oct 5, 2026/);
  assert.deepEqual(ticketNotices(null, { ...t, id: "TK-9" }, { email: wf.SYSTEM }).map((x) => [x.to, x.alert]), [[{ email: fac.email }, true]]);
  assert.equal(ticketFromSchedule(schedule(), T(0)).ticket.status, "new");
  const moved = afterOpening(schedule(), "TK-9", "2026-10-05", T(1));
  assert.equal(moved.next, "2026-11-05");
  assert.equal(moved.lastTicketId, "TK-9");
});

test("schedules: form checks, and assignees must be on the team", () => {
  const ctx = { today: "2026-10-05", members: { facilities: [fac.email], it: [] }, isNew: true };
  const good = parseScheduleInput({ team: "facilities", name: "Gutter cleaning", frequency: "semiannual", next: "2026-11-01", room: "Whole building", urgency: "low", assignee: fac.email.toUpperCase() }, ctx);
  assert.ok(good.ok);
  if (good.ok) assert.equal(good.value.assigneeEmail, fac.email);
  const bad = parseScheduleInput({ team: "facilities", name: "x", frequency: "daily", next: "2026-10-01", room: "", assignee: itTech.email }, ctx);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.errors.length, 5);
  assert.ok(parseScheduleInput({ team: "it", name: "Firmware", frequency: "quarterly", next: "2026-10-01", room: "Admin office" }, { ...ctx, isNew: false }).ok, "editing can keep a past date");
});

// ---- Form input ---------------------------------------------------------------------------

test("input: required fields, the 'Other' location, and photos only", () => {
  const ok = parseTicketInput({ team: "it", title: " Projector  flickers ", room: "Other", roomOther: "Library", urgency: "high", description: "Every few seconds." });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.input.title, "Projector flickers");
    assert.equal(ok.input.room, "Library");
  }
  const bad = parseTicketInput({ team: "x", title: "a", room: "", urgency: "soon", description: "" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.errors.length, 5);
  assert.deepEqual(checkPhotos([{ name: "a.JPG", size: 10 }, { name: "b.heic", size: 10 }]), []);
  assert.equal(checkPhotos([{ name: "doc.pdf", size: 10 }, { name: "big.png", size: 11 * 1024 * 1024 }]).length, 2);
});

// ---- Jira import ----------------------------------------------------------------------------

test("csv: quotes, commas and line breaks inside quotes, doubled quotes, CRLF and a BOM", () => {
  const rows = parseCsv('﻿a,b,c\r\n1,"two, three","say ""hi"""\r\n"multi\nline",,x\n\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["1", "two, three", 'say "hi"'], ["multi\nline", "", "x"]]);
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("jira: repeated columns keep every value; a file without the key columns is refused", () => {
  const r = readJiraCsv("Summary,Issue key,Labels,Labels,Labels\nX,FAC-1,hvac,,urgent\n");
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.rows[0].values.get("labels"), ["hvac", "urgent"]);
  assert.equal(readJiraCsv("Name,Email\na,b").ok, false);
});

test("jira: statuses, priorities, teams and dates", () => {
  assert.equal(jiraStatus("To Do"), "new");
  assert.equal(jiraStatus("In Progress"), "in_progress");
  assert.equal(jiraStatus("Waiting for parts"), "waiting_parts");
  assert.equal(jiraStatus("Blocked"), "waiting_parts");
  assert.equal(jiraStatus("Done"), "done");
  assert.equal(jiraStatus("QA"), null);
  assert.deepEqual([jiraUrgency("Highest").urgency, jiraUrgency("High").urgency, jiraUrgency("Medium").urgency, jiraUrgency("Lowest").urgency], ["urgent", "high", "normal", "low"]);
  assert.equal(jiraUrgency("P2").known, false);
  assert.equal(jiraTeam(["A/V", "hvac"]), "it");
  assert.equal(jiraTeam(["Wi-Fi & network"]), "it");
  assert.equal(jiraTeam(["Plumbing", "wudu"]), "facilities");
  assert.equal(jiraTeam(["Kitchen"]), "facilities", "words, not letters: 'kitchen' isn't IT");
  assert.equal(jiraTeam([]), "facilities");
  assert.deepEqual(parseJiraDate("23/Oct/26 2:15 PM"), { day: "2026-10-23", iso: "2026-10-23T18:15:00.000Z" });
  assert.deepEqual(parseJiraDate("05/Jan/2026 9:00 AM"), { day: "2026-01-05", iso: "2026-01-05T14:00:00.000Z" });
  assert.equal(parseJiraDate("2026-11-02")?.day, "2026-11-02");
  assert.equal(parseJiraDate("31/Feb/26"), null);
  assert.equal(parseJiraDate("next week"), null);
});

const jctx = (over: Partial<JiraContext> = {}): JiraContext => ({
  domain: d,
  importer: { email: `faclead@${d}`, name: "Fac Chair" },
  members: { facilities: [fac.email, facLead.email], it: [itTech.email] },
  existingKeys: new Set(),
  includeDone: false,
  now: T(1000),
  ...over,
});

const CSV = [
  "Summary,Issue key,Issue id,Issue Type,Status,Priority,Assignee,Reporter,Created,Due date,Labels,Labels,Component/s,Watchers,Watchers,Description,Comment,Custom field (Location)",
  `MPH not cooling,FAC-101,10101,Problem,In Progress,Highest,${fac.email},${reporter.email},20/Oct/26 9:00 AM,25/Oct/26,hvac,family-night,HVAC,${office.email},Sample Watcher,"It's 84°F inside.
Unit 2 is loud, maybe the compressor.","21/Oct/26 10:00 AM;abc123;Contractor coming tomorrow.",MPH A&B – full gym`,
  `Faucet drips,FAC-102,10102,Task,To Do,Medium,Sample Staffer,Sample Staffer,21/Oct/26 8:00 AM,,,,Plumbing,,,"Left faucet.",,women's prayer hall`,
  `Door latch,FAC-103,10103,Task,Waiting for parts,High,${fac2.email},someone@gmail.com,19/Oct/26 8:00 AM,,,,Doors,,,"Strike plate on order",,`,
  `Old fix,FAC-90,10090,Task,Done,Low,,,01/Oct/26 8:00 AM,,,,,,,"done",,`,
  `Projector,FAC-104,10104,Problem,QA,Low,,,01/Oct/26 8:00 AM,,av,,,,,"x",,`,
  `Printer jams,FAC-105,10105,Problem,Open,Low,${itTech.email},,22/Oct/26 8:00 AM,,printers,,,,,"",,Admin office`,
  `Faucet drips again,FAC-102,10106,Task,To Do,Medium,,,21/Oct/26 8:00 AM,,,,,,,"dup",,`,
  `Roadmap,FAC-1,10001,Epic,To Do,Medium,,,01/Oct/26 8:00 AM,,,,,,,"",,`,
  `,FAC-106,10107,Task,To Do,Medium,,,01/Oct/26 8:00 AM,,,,,,,"",,`,
].join("\r\n");

test("jira: a sample export maps to tickets, and every row that can't come over says why", () => {
  const r = planJiraImport(CSV, jctx());
  assert.ok(r.ok);
  if (!r.ok) return;
  const p = r.plan;
  assert.deepEqual(p.ready.map((x) => x.key), ["FAC-101", "FAC-102", "FAC-103", "FAC-105"]);
  assert.deepEqual(p.skippedDone.map((x) => x.key), ["FAC-90"]);
  assert.deepEqual(p.problems.map((x) => [x.row, x.key]), [[6, "FAC-104"], [8, "FAC-102"], [9, "FAC-1"], [10, "FAC-106"]]);
  assert.match(p.problems[0].reason, /Status “QA”/);
  assert.match(p.problems[1].reason, /twice/);
  assert.match(p.problems[2].reason, /Epics/);
  assert.match(p.problems[3].reason, /No summary/);
  assert.deepEqual(p.unmatchedPeople, ["Sample Staffer"]);

  const [mph, faucet, door, printer] = p.ready.map((x) => x.card);
  // Assignee and reporter by @domain email; multiline description; repeated labels and watchers; comment into history.
  assert.equal(mph.ticket.status, "in_progress");
  assert.equal(mph.ticket.urgency, "urgent");
  assert.equal(mph.ticket.assigneeEmail, fac.email);
  assert.equal(mph.ownerEmail, reporter.email);
  assert.equal(mph.ticket.jiraKey, "FAC-101");
  assert.equal(mph.ticket.description, "It's 84°F inside.\nUnit 2 is loud, maybe the compressor.");
  assert.deepEqual(mph.ticket.labels, ["hvac", "family-night"]);
  assert.deepEqual(mph.ticket.watchers.sort(), [fac.email, office.email, reporter.email].sort());
  assert.equal(mph.ticket.room, "MPH A&B – full gym");
  assert.equal(mph.ticket.dueDate, "2026-10-25");
  assert.equal(mph.createdAt, "2026-10-20T13:00:00.000Z");
  assert.ok(mph.ticket.history.some((h) => h.action === "Comment in Jira" && h.note === "Contractor coming tomorrow."));
  assert.match(mph.searchText!, /FAC-101/);
  assert.equal(mph.ticket.team, "facilities");
  // Names, not emails: unassigned, the importer is the reporter of record, the name kept in history.
  assert.equal(faucet.ticket.status, "new");
  assert.equal(faucet.ticket.assigneeEmail, undefined);
  assert.equal(faucet.ownerEmail, `faclead@${d}`);
  assert.equal(faucet.ticket.reporterName, "Sample Staffer");
  assert.equal(faucet.ticket.history[0].action, "Reported in Jira by Sample Staffer");
  assert.match(faucet.ticket.history.at(-1)!.note!, /Assigned in Jira to Sample Staffer/);
  assert.equal(faucet.ticket.room, "Women's Prayer Hall", "matched to the location list");
  assert.equal(faucet.ticket.kind, "request");
  // An @domain assignee who isn't on the team's Google Group stays unassigned; an outside reporter → importer.
  assert.equal(door.ticket.status, "waiting_parts");
  assert.equal(door.ticket.assigneeEmail, undefined);
  assert.match(door.ticket.history.at(-1)!.note!, /isn't on the Facility Maintenance Google Group/);
  assert.equal(door.ownerEmail, `faclead@${d}`);
  assert.equal(door.ticket.room, "Other");
  // Labels and components pick the team; an open issue with an assignee is "assigned".
  assert.equal(printer.ticket.team, "it");
  assert.equal(printer.ticket.status, "assigned");
  assert.equal(printer.ticket.assigneeEmail, itTech.email);
  assert.equal(printer.ticket.description, "Printer jams", "no description: the summary stands in");

  assert.deepEqual(planCounts(p), { status: { in_progress: 1, new: 1, waiting_parts: 1, assigned: 1 }, team: { facilities: 3, it: 1 } });
});

test("jira: re-importing skips keys already on tickets; done issues come over as closed only when asked", () => {
  const again = planJiraImport(CSV, jctx({ existingKeys: new Set(["FAC-101", "FAC-102"]) }));
  assert.ok(again.ok);
  if (!again.ok) return;
  assert.deepEqual(again.plan.alreadyImported.map((x) => x.key), ["FAC-101", "FAC-102"]);
  assert.deepEqual(again.plan.ready.map((x) => x.key), ["FAC-103", "FAC-105"]);
  // The second FAC-102 row is still reported as a duplicate, not imported twice.
  assert.ok(again.plan.problems.some((x) => x.key === "FAC-102" && /twice/.test(x.reason)));
  const withDone = planJiraImport(CSV, jctx({ includeDone: true }));
  assert.ok(withDone.ok);
  if (!withDone.ok) return;
  const old = withDone.plan.ready.find((x) => x.key === "FAC-90")!.card;
  assert.equal(old.ticket.status, "closed");
  assert.equal(old.status, "closed");
  assert.equal(old.ticket.resolutionNote, "Done in Jira");
});
