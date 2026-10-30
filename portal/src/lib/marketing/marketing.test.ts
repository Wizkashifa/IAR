/**
 * Marketing Requests rules. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Card } from "../cards";
import { canOpenCard } from "../access";
import { hrefOf } from "../kinds";
import { withComment } from "../comments";
import { MARKETING_KINDS, STAGE_LABEL } from "./types";
import { MARKETING_TYPES, type MarketingInput, asksForNotes, driveLinkOf, parseMarketingInput, redirectSource, titleFor } from "./forms";
import { canViewMarketing } from "./access";
import { marketingCommentNotices, marketingNotices } from "./notices";
import { planDaily } from "./reminders";
import * as wf from "./workflow";
import { FILE_KINDS, MAX_PER_REQUEST, MAX_PER_UPLOAD, asksForFiles, checkFiles, filesOf, requestFolderPath } from "./files";

const volunteer: wf.Actor = { email: "vol@x.org", name: "Vol Unteer", roles: ["member"] };
const mk: wf.Actor = { email: "mk@x.org", name: "Mark Eting", roles: ["member", "marketing"] };
const mk2: wf.Actor = { email: "mk2@x.org", name: "Second Marketer", roles: ["member", "marketing"] };
const chair: wf.Actor = { email: "chair@x.org", name: "Chair", roles: ["member", "chairs"] };
const office: wf.Actor = { email: "office@x.org", name: "Office", roles: ["member", "office"] };
const exec: wf.Actor = { email: "exec@x.org", name: "Exec", roles: ["member", "executive"] };
const admin: wf.Actor = { email: "admin@x.org", name: "Admin", roles: ["member", "admins"] };

// Thursday, Oct 22 2026, 10 AM in Raleigh.
const TODAY = "2026-10-22";
const T = (n: number) => new Date(Date.UTC(2026, 9, 22 + n, 14)).toISOString();
const ctx = { today: TODAY, committees: ["Youth", "Education"] };

function input(over: Partial<MarketingInput> = {}): MarketingInput {
  return { kind: "graphic", committee: "Youth", answers: { desc: "A certificate for the Quran reading challenge", due: "2026-11-20" }, ...over };
}

function submitted(over: Partial<MarketingInput> = {}, owner: wf.Actor = volunteer): wf.MarketingCard {
  const r = parseMarketingInput(input(over), { ...ctx, committees: [input(over).committee] });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const c = wf.newMarketing(r.details, owner, T(0));
  c.id = "MK-1001";
  return c;
}

const errorsOf = (over: Partial<MarketingInput>) => {
  const r = parseMarketingInput(input(over), ctx);
  return r.ok ? [] : r.errors;
};

// ---- Forms ---------------------------------------------------------------

test("forms: every request type has a label, a blurb and at least one required question", () => {
  assert.deepEqual(Object.keys(MARKETING_TYPES).sort(), [...MARKETING_KINDS].sort());
  for (const k of MARKETING_KINDS) {
    const t = MARKETING_TYPES[k];
    assert.ok(t.label && t.blurb, k);
    assert.ok(t.fields.some((f) => f.required), k);
    assert.equal(new Set(t.fields.map((f) => f.key)).size, t.fields.length, k);
  }
});

test("forms: a valid request per type passes; unknown answers are dropped", () => {
  const ok: Record<string, Record<string, string>> = {
    graphic: { desc: "Banner", due: "2026-11-20" },
    signage: { desc: "Room signs", due: "2026-11-20" },
    announce: { text: "Pantry open Wednesdays", due: TODAY },
    highlight: { desc: "Basketball win", due: "2026-11-01" },
    webpage: { desc: "A page for the food pantry" },
    webedit: { url: "https://raleighmasjid.org/programs", desc: "Fix the Saturday time" },
    redirect: { from: "raleighmasjid.org/pantry", to: "https://forms.gle/abc" },
    badge: { first: "New", last: "Hire", title: "Technician", photo: "onsite" },
    custom: { desc: "A short video for the fundraiser" },
    event: { piece: "flyer", due: "2026-11-20" },
  };
  for (const k of MARKETING_KINDS) {
    const r = parseMarketingInput({ kind: k, committee: "Youth", answers: { ...ok[k], sneaky: "x" } }, ctx);
    assert.ok(r.ok, `${k}: ${r.ok ? "" : r.errors.join("; ")}`);
    if (r.ok) assert.equal(r.details.answers.sneaky, undefined);
  }
});

test("forms: required questions, type and committee are checked", () => {
  assert.match(errorsOf({ answers: { due: "2026-11-20" } }).join(), /Please answer: Describe the design/);
  assert.match(errorsOf({ answers: { desc: "x" } }).join(), /Please answer: When is this design needed by/);
  assert.match(errorsOf({ kind: "flyer" }).join(), /Pick what kind/);
  assert.match(errorsOf({ committee: "" }).join(), /Pick the committee/);
  assert.match(errorsOf({ committee: "Shura" }).join(), /one of your committees/);
  // Optional questions can be left out.
  assert.deepEqual(errorsOf({ kind: "highlight", answers: { desc: "Win", due: "2026-11-01" } }), []);
  assert.deepEqual(errorsOf({ kind: "badge", answers: { first: "A", last: "B", photo: "none" } }), []);
});

test("forms: dates must be real and not in the past", () => {
  assert.match(errorsOf({ answers: { desc: "x", due: "2026-10-21" } }).join(), /already passed/);
  assert.match(errorsOf({ answers: { desc: "x", due: "2026-02-30" } }).join(), /Pick a date/);
  assert.match(errorsOf({ answers: { desc: "x", due: "next week" } }).join(), /Pick a date/);
  assert.match(errorsOf({ answers: { desc: "x", due: "2029-01-01" } }).join(), /two years/);
  assert.deepEqual(errorsOf({ answers: { desc: "x", due: TODAY } }), []);
});

test("forms: links must be full web links; the Drive link is optional", () => {
  assert.match(errorsOf({ kind: "webedit", answers: { url: "raleighmasjid.org/programs", desc: "x" } }).join(), /https:\/\//);
  assert.match(errorsOf({ kind: "webedit", answers: { url: "javascript:alert(1)", desc: "x" } }).join(), /https:\/\//);
  assert.match(errorsOf({ driveLink: "my drive" }).join(), /Google Drive link/);
  assert.deepEqual(errorsOf({ driveLink: "https://drive.google.com/drive/folders/abc" }), []);
  assert.match(errorsOf({ notes: "x".repeat(2001) }).join(), /under 2,000/);
});

test("forms: badge photo must be one of the choices", () => {
  assert.match(errorsOf({ kind: "badge", answers: { first: "A", last: "B", photo: "selfie" } }).join(), /Pick one/);
});

test("forms: redirects live on raleighmasjid.org, islam1.org or iar.to, with a path", () => {
  assert.equal(redirectSource("raleighmasjid.org/post"), "raleighmasjid.org/post");
  assert.equal(redirectSource("https://www.RaleighMasjid.org/Post/"), "raleighmasjid.org/Post");
  assert.equal(redirectSource("iar.to/eid"), "iar.to/eid");
  assert.equal(redirectSource("islam1.org/x"), "islam1.org/x");
  assert.equal(redirectSource("example.com/post"), null);
  assert.equal(redirectSource("raleighmasjid.org.evil.com/post"), null);
  assert.equal(redirectSource("raleighmasjid.org"), null);
  assert.equal(redirectSource("raleighmasjid.org/"), null);
  assert.equal(redirectSource("raleighmasjid.org/a b"), null);
  assert.match(errorsOf({ kind: "redirect", answers: { from: "bit.ly/x", to: "https://forms.gle/abc" } }).join(), /raleighmasjid.org, islam1.org or iar.to/);
  assert.match(errorsOf({ kind: "redirect", answers: { from: "iar.to/x", to: "https://iar.to/x" } }).join(), /same address/);
  const r = parseMarketingInput({ kind: "redirect", committee: "Youth", answers: { from: "https://raleighmasjid.org/po", to: "https://forms.gle/abc" } }, ctx);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.details.answers.from, "raleighmasjid.org/po");
});

test("forms: titles come from the answers", () => {
  assert.equal(titleFor("badge", { first: "New", last: "Hire" }), "Staff badge: New Hire");
  assert.equal(titleFor("redirect", { from: "iar.to/eid" }), "Redirect iar.to/eid");
  assert.equal(titleFor("webedit", { desc: "Fix the time" }), "Website update: Fix the time");
  assert.equal(titleFor("announce", { text: "Pantry\n open" }), "Pantry open");
  assert.equal(titleFor("graphic", { desc: "x".repeat(80) }).length, 60);
});

// ---- Workflow --------------------------------------------------------------

test("new request: shows as New for the team to pick up, with history, search words and a link", () => {
  const c = submitted();
  assert.equal(c.type, "marketing");
  assert.equal(c.status, "submitted");
  assert.equal(c.marketing.stage, "review");
  assert.equal(c.waitingOn, "Marketing: new request");
  assert.equal(STAGE_LABEL.review, "New");
  assert.equal(STAGE_LABEL.question, "Waiting on the requester");
  assert.equal(c.committee, "Youth");
  assert.equal(c.marketing.requesterName, "Vol Unteer");
  assert.deepEqual(c.marketing.history.map((h) => h.action), ["Submitted"]);
  assert.match(c.searchText ?? "", /Graphic design/);
  assert.match(c.searchText ?? "", /Quran reading/);
  assert.equal(hrefOf(c), "/marketing/MK-1001");
});

test("new request: needed in under two weeks gets a short-notice note", () => {
  const c = submitted({ answers: { desc: "x", due: "2026-10-29" } });
  assert.equal(c.marketing.history[1].action, "Short notice");
  assert.match(c.marketing.history[1].note ?? "", /Needed in 7 days/);
  assert.ok(wf.isTight(c, TODAY));
  assert.equal(wf.isTight(submitted(), TODAY), false);
});

test("review: marketing schedules with a done-by date; the requester is told", () => {
  const c = submitted();
  const s = wf.schedule(c, mk, T(1), "2026-11-04", "Poster size");
  assert.equal(s.marketing.stage, "scheduled");
  assert.equal(s.status, "approved");
  assert.equal(s.marketing.doneBy, "2026-11-04");
  assert.equal(s.waitingOn, "Marketing: due Nov 4");
  assert.match(s.marketing.history.at(-1)!.action, /Scheduled, to finish by Wednesday, November 4/);
  assert.equal(s.marketing.history.at(-1)!.note, "Poster size");
  assert.throws(() => wf.schedule(c, mk, T(1), "2026-10-01"), /already passed/);
  assert.throws(() => wf.schedule(c, mk, T(1), ""), /Pick the date/);
});

test("review: only the marketing team acts, and never on their own request", () => {
  const c = submitted();
  for (const who of [volunteer, chair, office, exec, admin]) {
    for (const a of ["schedule", "ask", "decline", "start", "finish", "reschedule"] as wf.Action[]) assert.equal(wf.permission(c, who, a).ok, false, `${who.email} ${a}`);
  }
  assert.throws(() => wf.schedule(c, volunteer, T(1), "2026-11-04"), /marketing team/);
  const own = submitted({}, mk);
  assert.equal(wf.permission(own, mk, "schedule").ok, false);
  assert.equal(wf.permission(own, mk, "ask").ok, false);
  assert.equal(wf.permission(own, mk, "decline").ok, false);
  assert.ok(wf.permission(own, mk2, "schedule").ok);
  assert.deepEqual(wf.reviewableBy([c, own], mk).map((x) => x.ownerEmail), [volunteer.email]);
  // Once someone else schedules it, the marketer can do their own work.
  const s = wf.schedule(own, mk2, T(1), "2026-11-04");
  assert.ok(wf.permission(s, mk, "start").ok);
});

test("question: marketing asks, the requester answers, it's back in review", () => {
  const c = submitted();
  assert.throws(() => wf.ask(c, mk, T(1), "  "), /Write your question/);
  const q = wf.ask(c, mk, T(1), "Which size?");
  assert.equal(q.marketing.stage, "question");
  assert.equal(q.status, "changes_requested");
  assert.equal(q.waitingOn, "You: answer marketing's question");
  assert.equal(q.marketing.question, "Which size?");
  assert.equal(wf.permission(q, mk, "schedule").ok, false);
  assert.equal(wf.permission(q, mk, "answer").ok, false);
  assert.throws(() => wf.answer(q, volunteer, T(2), ""), /Write your answer/);
  const a = wf.answer(q, volunteer, T(2), "Poster, 24x36");
  assert.equal(a.marketing.stage, "review");
  assert.equal(a.status, "submitted");
  assert.equal(a.marketing.question, undefined);
  assert.deepEqual(a.marketing.history.slice(-2).map((h) => [h.action, h.note]), [["Asked a question", "Which size?"], ["Answered marketing's question", "Poster, 24x36"]]);
  assert.equal(wf.permission(c, volunteer, "answer").ok, false);
});

test("question: the requester can edit while answering; the type can't change", () => {
  const q = wf.ask(submitted(), mk, T(1), "Which committee?");
  const r = parseMarketingInput(input({ committee: "Education", answers: { desc: "A new description", due: "2026-11-25" } }), ctx);
  assert.ok(r.ok);
  if (!r.ok) return;
  const a = wf.answer(q, volunteer, T(2), "Education, sorry", r.details);
  assert.equal(a.committee, "Education");
  assert.equal(a.title, "A new description");
  assert.equal(a.marketing.answers.due, "2026-11-25");
  assert.equal(a.marketing.history.at(-1)!.action, "Edited the request");
  const other = parseMarketingInput({ kind: "custom", committee: "Youth", answers: { desc: "x" } }, ctx);
  assert.ok(other.ok);
  if (other.ok) assert.throws(() => wf.answer(q, volunteer, T(2), "x", other.details), /type can't change/);
});

test("edit: the requester can change the request until it's scheduled", () => {
  const c = submitted();
  const r = parseMarketingInput(input({ answers: { desc: "Changed", due: "2026-11-20" } }), ctx);
  assert.ok(r.ok);
  if (!r.ok) return;
  const e = wf.edit(c, volunteer, T(1), r.details);
  assert.equal(e.marketing.stage, "review");
  assert.equal(e.title, "Changed");
  assert.equal(e.marketing.history.at(-1)!.action, "Edited the request");
  const same = parseMarketingInput(input(), ctx);
  if (same.ok) assert.throws(() => wf.edit(c, volunteer, T(1), same.details), /Nothing changed/);
  assert.throws(() => wf.edit(c, mk, T(1), r.details), /Only the requester/);
  const s = wf.schedule(c, mk, T(1), "2026-11-04");
  assert.throws(() => wf.edit(s, volunteer, T(2), r.details), /already scheduled/);
});

test("work: start, change the date, finish", () => {
  const s = wf.schedule(submitted(), mk, T(1), "2026-11-04");
  assert.equal(wf.permission(s, volunteer, "start").ok, false);
  const d = wf.start(s, mk2, T(2));
  assert.equal(d.marketing.stage, "doing");
  assert.equal(d.status, "approved");
  assert.equal(d.marketing.assignee, mk2.email);
  assert.equal(d.waitingOn, "Marketing: in progress, due Nov 4");
  assert.equal(wf.permission(d, mk, "start").ok, false);
  assert.throws(() => wf.reschedule(d, mk, T(2), "2026-11-04"), /already the done-by date/);
  const r = wf.reschedule({ ...d, marketing: { ...d.marketing, remindedFor: "2026-11-04" } }, mk, T(2), "2026-11-09");
  assert.equal(r.marketing.doneBy, "2026-11-09");
  assert.equal(r.marketing.remindedFor, undefined);
  assert.equal(r.marketing.stage, "doing");
  const f = wf.finish(r, mk, T(3), "https://drive.google.com/file/d/final");
  assert.equal(f.marketing.stage, "done");
  assert.equal(f.status, "closed");
  assert.equal(f.waitingOn, undefined);
  assert.equal(f.marketing.doneNote, "https://drive.google.com/file/d/final");
  assert.equal(f.marketing.assignee, mk2.email);
  for (const a of ["schedule", "ask", "decline", "start", "finish", "reschedule", "edit", "cancel", "answer"] as wf.Action[]) {
    assert.equal(wf.permission(f, mk, a).ok, false, a);
    assert.equal(wf.permission(f, volunteer, a).ok, false, a);
  }
  // Small jobs can be marked done straight from scheduled.
  assert.equal(wf.finish(s, mk, T(2)).marketing.stage, "done");
  assert.equal(wf.permission(submitted(), mk, "finish").ok, false);
});

test("decline: needs a reason; possible until the work starts", () => {
  const c = submitted();
  assert.throws(() => wf.decline(c, mk, T(1), ""), /Say why/);
  const d = wf.decline(c, mk, T(1), "We can't print shirts.");
  assert.equal(d.status, "denied");
  assert.equal(d.marketing.declineReason, "We can't print shirts.");
  assert.equal(d.waitingOn, undefined);
  assert.ok(wf.permission(wf.ask(c, mk, T(1), "?"), mk, "decline").ok);
  const s = wf.schedule(c, mk, T(1), "2026-11-04");
  assert.ok(wf.permission(s, mk, "decline").ok);
  assert.equal(wf.permission(wf.start(s, mk, T(2)), mk, "decline").ok, false);
});

test("cancel: the requester, before it's scheduled", () => {
  const c = submitted();
  assert.equal(wf.permission(c, mk, "cancel").ok, false);
  const x = wf.cancel(c, volunteer, T(1));
  assert.equal(x.status, "cancelled");
  assert.equal(x.marketing.history.at(-1)!.action, "Cancelled by requester");
  assert.ok(wf.permission(wf.ask(c, mk, T(1), "?"), volunteer, "cancel").ok);
  assert.equal(wf.permission(wf.schedule(c, mk, T(1), "2026-11-04"), volunteer, "cancel").ok, false);
});

test("suggested done-by: when it's needed, else two weeks out", () => {
  assert.equal(wf.suggestedDoneBy(submitted(), TODAY), "2026-11-20");
  assert.equal(wf.suggestedDoneBy(submitted({ kind: "webpage", answers: { desc: "x" } }), TODAY), "2026-11-05");
});

// ---- Visibility ------------------------------------------------------------

test("visibility: requester, marketing, office, executive, admins and anyone who acted", () => {
  const c = submitted();
  const sees = (a: wf.Actor, seeAll = false) => canViewMarketing(c, { ...a, seeAll });
  assert.ok(sees(volunteer));
  assert.ok(sees({ ...volunteer, email: "VOL@x.org" }));
  assert.ok(sees(mk));
  assert.ok(sees(office));
  assert.ok(sees(exec));
  assert.ok(sees(admin, true));
  assert.equal(sees(chair), false);
  assert.equal(sees(admin), false);
  // The requesting committee's chairs, vice chairs and director see it.
  assert.ok(canViewMarketing(c, { ...chair, leads: [`portal-team-${c.committee.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@x.org`] }));
  // Someone who left the marketing team still sees what they worked on.
  const s = wf.schedule(c, mk, T(1), "2026-11-04");
  assert.ok(canViewMarketing(s, { ...mk, roles: ["member"] }));
  // The portal-wide rule uses this one.
  assert.ok(canOpenCard(s as Card, mk));
  assert.equal(canOpenCard(s as Card, chair), false);
});

// ---- Notices ---------------------------------------------------------------

test("notices: a new request alerts the marketing team's space", () => {
  const c = submitted();
  const n = marketingNotices(null, c, volunteer);
  assert.equal(n.length, 1);
  assert.deepEqual(n[0].to, { role: "marketing" });
  assert.equal(n[0].alert, true);
  assert.equal(n[0].href, "/marketing/MK-1001");
  assert.match(n[0].text, /^New marketing request: MK-1001 /);
  assert.doesNotMatch(n[0].text, /weekly/i);
});

test("notices: a question alerts the requester; their answer alerts marketing", () => {
  const c = submitted();
  const q = wf.ask(c, mk, T(1), "Which size?");
  const n1 = marketingNotices(c, q, mk);
  assert.deepEqual(n1.map((x) => [x.to, x.alert]), [[{ email: volunteer.email }, true]]);
  assert.match(n1[0].text, /marketing has a question: Which size\?/);
  const a = wf.answer(q, volunteer, T(2), "Poster");
  const n2 = marketingNotices(q, a, volunteer);
  assert.deepEqual(n2.map((x) => [x.to, x.alert]), [[{ role: "marketing" }, true]]);
  assert.match(n2[0].text, /Vol Unteer answered your question/);
});

test("notices: scheduled and done tell the requester without an alert; declined alerts", () => {
  const c = submitted();
  const s = wf.schedule(c, mk, T(1), "2026-11-04");
  const n1 = marketingNotices(c, s, mk);
  assert.deepEqual(n1.map((x) => [x.to, x.alert]), [[{ email: volunteer.email }, false]]);
  assert.match(n1[0].text, /scheduled\. Marketing aims to finish by Wednesday, November 4/);
  const d = wf.start(s, mk, T(2));
  assert.deepEqual(marketingNotices(s, d, mk), []);
  const r = wf.reschedule(d, mk, T(2), "2026-11-09");
  assert.match(marketingNotices(d, r, mk)[0].text, /now aims to finish by Monday, November 9/);
  const f = wf.finish(d, mk, T(3), "Posted.");
  const n2 = marketingNotices(d, f, mk);
  assert.deepEqual(n2.map((x) => [x.to, x.alert]), [[{ email: volunteer.email }, false]]);
  assert.match(n2[0].text, /is done\. Posted\./);
  const x = wf.decline(c, mk, T(1), "Not something we do.");
  const n3 = marketingNotices(c, x, mk);
  assert.deepEqual(n3.map((y) => [y.to, y.alert]), [[{ email: volunteer.email }, true]]);
  assert.match(n3[0].text, /was declined: Not something we do\./);
});

test("notices: nobody is told about their own step; a cancel in review tells marketing quietly", () => {
  const own = submitted({}, mk);
  const s = wf.schedule(own, mk2, T(1), "2026-11-04");
  const f = wf.finish(s, mk, T(2));
  assert.deepEqual(marketingNotices(s, f, mk), []);
  const c = submitted();
  const x = wf.cancel(c, volunteer, T(1));
  assert.deepEqual(marketingNotices(c, x, volunteer).map((n) => [n.to, n.alert]), [[{ role: "marketing" }, false]]);
  const q = wf.ask(c, mk, T(1), "?");
  assert.deepEqual(marketingNotices(q, wf.cancel(q, volunteer, T(2)), volunteer), []);
  // Editing in review moves nothing.
  const r = parseMarketingInput(input({ answers: { desc: "Changed", due: "2026-11-20" } }), ctx);
  if (r.ok) assert.deepEqual(marketingNotices(c, wf.edit(c, volunteer, T(1), r.details), volunteer), []);
});

test("comment notices: requester, earlier commenters and whoever has it; never an alert", () => {
  const c = submitted();
  const n1 = marketingCommentNotices(c, mk, "Which size?");
  assert.deepEqual(n1.map((n) => n.to), [{ email: volunteer.email }, { role: "marketing" }]);
  assert.ok(n1.every((n) => !n.alert && n.href === "/marketing/MK-1001#comments"));
  const d = wf.start(wf.schedule(c, mk, T(1), "2026-11-04"), mk2, T(2));
  const withC = withComment(d, { at: T(2), by: chair.email, name: chair.name, text: "Looks great" });
  const n2 = marketingCommentNotices(withC, volunteer, "Thanks!");
  assert.deepEqual(n2.map((n) => n.to), [{ email: chair.email }, { email: mk2.email }]);
  assert.match(n2[0].text, /Vol Unteer commented on MK-1001 .*: “Thanks!”/);
});

test("comment notices: someone named with @ hears first, with an alert", () => {
  const c = withComment(submitted(), { at: T(1), by: mk.email, name: mk.name, text: "@Exec can you approve the wording?", mentions: [{ email: exec.email, name: exec.name }, { email: volunteer.email, name: volunteer.name }] });
  const n = marketingCommentNotices(c, mk, "@Exec can you approve the wording?");
  assert.deepEqual(n.map((x) => [x.to, x.alert]), [[{ email: exec.email }, true], [{ email: volunteer.email }, true], [{ role: "marketing" }, false]]);
  assert.match(n[0].text, /Mark Eting mentioned you on MK-1001 .*: “@Exec can you approve the wording\?”/);
  // Only the newest comment's mentions, and only when it's the commenter's own.
  const later = withComment(c, { at: T(2), by: volunteer.email, name: volunteer.name, text: "Thanks" });
  assert.ok(marketingCommentNotices(later, volunteer, "Thanks").every((x) => !x.alert));
});

// ---- Daily job ---------------------------------------------------------------

test("daily: one nudge for new requests nobody has picked up after 2 days, once each", () => {
  const a = submitted();
  const b = { ...submitted({ answers: { desc: "Second", due: "2026-11-20" } }), id: "MK-1002" };
  const q = { ...wf.ask(submitted(), mk, T(1), "?"), id: "MK-1003" };
  const sched = { ...wf.schedule(submitted(), mk, T(1), "2026-11-20"), id: "MK-1004" };
  assert.deepEqual(planDaily([a, b, q, sched], "2026-10-23").notices, [], "not yet: 1 day");
  const p = planDaily([a, b, q, sched], "2026-10-24");
  assert.equal(p.notices.length, 1);
  assert.deepEqual(p.notices[0].to, { role: "marketing" });
  assert.equal(p.notices[0].alert, true);
  assert.equal(p.notices[0].href, "/marketing?view=team&f=new");
  assert.match(p.notices[0].text, /^2 new marketing requests have waited 2 days for someone to pick them up: MK-1001 .*, MK-1002/);
  assert.deepEqual(planDaily([a, b], "2026-10-25").notices, [], "only on the day it reaches 2 days");
  assert.match(planDaily([a], "2026-10-24").notices[0].text, /^A new marketing request has waited 2 days for someone to pick it up/);
  const answered = wf.answer(q, volunteer, T(3), "Yes");
  assert.equal(planDaily([answered], "2026-10-27").notices.length, 1, "back as new after a question: nudged again");
});

test("daily: done-by reminders for tomorrow, today or past, once per date", () => {
  const s = (doneBy: string, id: string) => ({ ...wf.schedule(submitted(), mk, T(0), doneBy), id });
  const tomorrow = s("2026-10-23", "MK-1");
  const todayDue = wf.start(s(TODAY, "MK-2"), mk, T(0));
  const later = s("2026-10-30", "MK-3");
  const late = { ...tomorrow, id: "MK-4", marketing: { ...tomorrow.marketing, doneBy: "2026-10-20" } };
  const done = wf.finish(s("2026-10-23", "MK-5"), mk, T(0));
  const p = planDaily([tomorrow, todayDue, later, late, done], TODAY);
  assert.deepEqual(p.notices.map((n) => n.cardId), ["MK-1", "MK-2", "MK-4"]);
  assert.ok(p.notices.every((n) => n.alert && "role" in n.to && n.to.role === "marketing"));
  assert.match(p.notices[0].text, /is due tomorrow and hasn't been started/);
  assert.match(p.notices[1].text, /is due today\.$/);
  assert.match(p.notices[2].text, /was due Oct 20/);
  assert.deepEqual(p.reminded.map((c) => [c.id, c.marketing.remindedFor, c.updatedAt === tomorrow.updatedAt || c.id !== "MK-1"]), [
    ["MK-1", "2026-10-23", true],
    ["MK-2", TODAY, true],
    ["MK-4", "2026-10-20", true],
  ]);
  // Already reminded: nothing the next day.
  assert.deepEqual(planDaily(p.reminded, "2026-10-23").notices, []);
  // Rescheduled to a new date that comes due: a new reminder.
  const moved = wf.reschedule(p.reminded[0], mk, T(0), "2026-10-24");
  assert.equal(planDaily([moved], "2026-10-23").notices.length, 1);
});

// ---- Files -----------------------------------------------------------------

const MB = 1024 * 1024;

test("files: the types that start from the requester's material ask for them", () => {
  assert.deepEqual([...FILE_KINDS].sort(), ["badge", "custom", "event", "graphic", "highlight", "signage", "webpage"]);
  assert.equal(asksForFiles("graphic"), true);
  assert.equal(asksForFiles("redirect"), false);
  assert.equal(asksForFiles("announce"), false);
});

test("files: images, artwork and documents up to 10 MB each, a few at a time, 20 per request", () => {
  assert.deepEqual(checkFiles([{ name: "logo.ai", size: 2 * MB }, { name: "photo.HEIC", size: 3 * MB }, { name: "wording.docx", size: 20_000 }]), []);
  assert.match(checkFiles([{ name: "setup.exe", size: 100 }])[0], /setup\.exe: use an image/);
  assert.match(checkFiles([{ name: "big.png", size: 11 * MB }])[0], /over 10 MB/);
  const many = Array.from({ length: MAX_PER_UPLOAD + 1 }, (_, i) => ({ name: `p${i}.jpg`, size: 1000 }));
  assert.match(checkFiles(many)[0], /at most 8 files at a time/);
  assert.match(checkFiles([{ name: "one.jpg", size: 1000 }], MAX_PER_REQUEST)[0], /up to 20 files/);
  const heavy = Array.from({ length: 3 }, (_, i) => ({ name: `p${i}.png`, size: 9 * MB }));
  assert.match(checkFiles(heavy).join(" "), /over 25 MB together/);
});

test("files: an event's marketing images are images only, no PDFs or Word documents", () => {
  assert.deepEqual(checkFiles([{ name: "flyer.PNG", size: 1000 }, { name: "speaker.jpeg", size: 1000 }, { name: "phone.heic", size: 1000 }, { name: "logo.svg", size: 1000 }], 0, { imagesOnly: true }), []);
  const bad = checkFiles([{ name: "details.pdf", size: 1000 }, { name: "wording.docx", size: 1000 }, { name: "art.psd", size: 1000 }], 0, { imagesOnly: true });
  assert.equal(bad.length, 3);
  assert.match(bad[0], /details\.pdf: only images/);
});

test("assign: anyone on the marketing team hands scheduled or in-progress work to a teammate", () => {
  const members = [mk.email, mk2.email];
  const c = submitted();
  assert.equal(wf.permission(c, mk, "assign").ok, false, "not before it's scheduled");
  const s = wf.schedule(c, mk, T(1), "2026-11-04");
  assert.equal(wf.permission(s, volunteer, "assign").ok, false, "only the marketing team");
  assert.throws(() => wf.assign(s, mk, T(1), "vol@x.org", members), /isn't on the marketing team/);
  assert.throws(() => wf.assign(s, mk, T(1), "", members), /Choose who/);

  const a = wf.assign(s, mk, T(1), "MK2@x.org", members);
  assert.equal(a.marketing.assignee, mk2.email);
  assert.equal(a.marketing.stage, "scheduled", "handing it over doesn't move it");
  assert.equal(a.marketing.history.at(-1)?.action, `Assigned to ${mk2.email}`);
  assert.throws(() => wf.assign(a, mk, T(1), mk2.email, members), /already working on it/);
  assert.deepEqual(marketingNotices(s, a, mk).map((n) => ["email" in n.to ? n.to.email : "", n.alert]), [[mk2.email, true]], "the new person gets an alert");

  // Whoever it was handed to keeps it when someone else starts it.
  const d = wf.start(a, mk, T(2));
  assert.equal(d.marketing.assignee, mk2.email);
  const back = wf.assign(d, mk2, T(2), mk.email, members);
  assert.equal(back.marketing.assignee, mk.email);
  assert.equal(back.marketing.history.at(-1)?.action, `Handed from ${mk2.email} to ${mk.email}`);
  assert.deepEqual(marketingNotices(d, wf.assign(d, mk, T(2), mk.email, members), mk), [], "taking it yourself tells nobody");
  assert.equal(wf.permission(wf.finish(back, mk, T(3)), mk, "assign").ok, false, "not once it's done");
});

test("files: the requester and the marketing team add files; nobody adds to a closed request", () => {
  const c = submitted();
  assert.equal(wf.permission(c, volunteer, "files").ok, true);
  assert.equal(wf.permission(c, mk, "files").ok, true);
  assert.equal(wf.permission(c, chair, "files").ok, false);
  assert.equal(wf.permission(c, admin, "files").ok, false);

  const withFiles = wf.addFiles(c, volunteer, T(1), [{ name: "logo.png", size: 1000 }, { name: "photo.jpg", size: 2000, driveFileId: "abc", url: "https://drive.google.com/file/d/abc" }]);
  assert.equal(filesOf(withFiles.marketing).length, 2);
  assert.equal(withFiles.marketing.files?.[0].by, "vol@x.org");
  assert.equal(withFiles.marketing.stage, "review", "adding files doesn't move the request");
  assert.equal(withFiles.marketing.history.at(-1)?.action, "Added 2 files");
  assert.equal(withFiles.marketing.history.at(-1)?.note, "logo.png, photo.jpg");

  // Done work can still get a file; declined and cancelled requests can't.
  const done = wf.finish(wf.schedule(withFiles, mk2, T(1), "2026-11-10"), mk2, T(2));
  assert.equal(wf.addFiles(done, mk, T(3), [{ name: "final.pdf", size: 10 }]).marketing.files?.length, 3);
  assert.throws(() => wf.addFiles(wf.cancel(c, volunteer, T(1)), volunteer, T(2), [{ name: "x.png", size: 1 }]), /closed/);
  assert.throws(() => wf.addFiles(c, volunteer, T(1), []), /Choose a file/);
  const full = wf.addFiles(c, volunteer, T(1), Array.from({ length: MAX_PER_REQUEST }, (_, i) => ({ name: `f${i}.png`, size: 1 })));
  assert.throws(() => wf.addFiles(full, mk, T(2), [{ name: "one-more.png", size: 1 }]), /up to 20 files/);
});

test("a request's files go in one folder, by type then the year it was sent in Raleigh", () => {
  assert.deepEqual(requestFolderPath("graphic", "MK-1004", "2026-10-27T15:00:00.000Z"), ["Graphic design", "2026", "MK-1004"]);
  // New Year's Eve evening in Raleigh is already January in UTC: still last year's folder.
  assert.deepEqual(requestFolderPath("highlight", "MK-1010", "2027-01-01T02:00:00.000Z"), ["Highlight an event, accomplishment or team member", "2026", "MK-1010"]);
});

test("forms: comments only where the type has no open question for them", () => {
  assert.deepEqual(MARKETING_KINDS.filter(asksForNotes), ["redirect", "badge"]);
});

test("forms: a highlight sent before the Files section keeps its Drive folder as the Drive link", () => {
  assert.equal(driveLinkOf({ kind: "highlight", answers: { media: "https://drive.google.com/a" } }), "https://drive.google.com/a");
  assert.equal(driveLinkOf({ kind: "highlight", answers: { media: "https://drive.google.com/a" }, driveLink: "https://drive.google.com/b" }), "https://drive.google.com/b");
  assert.equal(driveLinkOf({ kind: "graphic", answers: { media: "https://drive.google.com/a" } }), undefined);
});
