/**
 * Asking for a booked time slot. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ORG } from "../org";
import type { Directory } from "../teams";
import * as sr from "./slot-requests";

const d = ORG.domain;
const youth = `portal-team-youth@${d}`;
const women = `portal-team-womens-committee@${d}`;
const dir: Directory = {
  teams: [
    { email: youth, name: "Youth", members: [{ email: `ychair@${d}`, role: "OWNER", type: "USER" }, { email: `yvice@${d}`, role: "MANAGER", type: "USER" }, { email: `yvol@${d}`, role: "MEMBER", type: "USER" }] },
    { email: women, name: "Women's Committee", members: [{ email: `wchair@${d}`, role: "OWNER", type: "USER" }] },
  ],
  pillars: [{ email: `portal-pillar-community@${d}`, name: "Community", members: [{ email: `director@${d}`, role: "OWNER", type: "USER" }, { email: youth, role: "MEMBER", type: "GROUP" }] }],
};

const requester: sr.SlotActor = { email: `wchair@${d}`, name: "Women's Chair", roles: ["member", "chairs"] };
const owner: sr.SlotActor = { email: `yvol@${d}`, name: "Youth Volunteer", roles: ["member"] };
const ychair: sr.SlotActor = { email: `ychair@${d}`, name: "Youth Chair", roles: ["member", "chairs"] };
const director: sr.SlotActor = { email: `director@${d}`, name: "Director", roles: ["member"] };
const exec: sr.SlotActor = { email: `exec@${d}`, name: "Exec", roles: ["member", "executive"] };
const office: sr.SlotActor = { email: `office@${d}`, name: "Office", roles: ["member", "office"] };
const stranger: sr.SlotActor = { email: `someone@${d}`, name: "Someone", roles: ["member"] };

const T = (n: number) => new Date(Date.UTC(2026, 10, 1 + n, 14)).toISOString();
const TUESDAYS = ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08"];

const oneTime: sr.Hold = { kind: "booking", label: "Family Night", room: "Room 250", start: "18:00", end: "21:00", cardId: "EV-1031", ownerEmail: owner.email, committeeGroup: youth, calendarEventId: "cal1031", seriesDates: ["2026-11-07"] };
const series: sr.Hold = { kind: "booking", label: "Youth Weekly Halaqa", room: "Room 250", start: "19:00", end: "20:30", cardId: "EV-1022", ownerEmail: owner.email, committeeGroup: youth, calendarEventId: "cal1022", seriesDates: TUESDAYS };
const calendarOnly: sr.Hold = { kind: "booking", label: "Shura meeting", room: "Room 280", start: "19:00", end: "21:00", calendarEventId: "calShura", organizerEmail: "someone@gmail.com", seriesDates: ["2026-11-05"] };

function ask(hold: sr.Hold, dates: string[], existing: sr.SlotRequest[] = [], id = "SR-1"): sr.SlotRequest {
  const r = sr.newSlotRequest({ fromCard: "EV-1061", requester, hold, dates, reason: "Annual sisters' dinner, only date the speaker can come" }, dir, existing, T(0));
  if (!r.ok) throw new Error(r.error);
  return { ...r.value, id };
}
function decided(req: sr.SlotRequest, actor: sr.SlotActor, choice: sr.SlotChoice, note = "") {
  const r = sr.decide(req, actor, choice, note, T(1));
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

test("asks go to the owner and their committee's chair and vice chair", () => {
  const r = ask(oneTime, ["2026-11-07"]);
  assert.deepEqual(r.askedOf.sort(), [owner.email, ychair.email, `yvice@${d}`].sort());
  assert.equal(r.status, "open");
  assert.equal(r.holdKey, "card:EV-1031");
});

test("a calendar entry made outside the portal has no owner here: the office answers for it, with its maker if they're at IAR", () => {
  assert.deepEqual(ask(calendarOnly, ["2026-11-05"]).askedOf, ["role:office"]);
  assert.deepEqual(ask({ ...calendarOnly, organizerEmail: `secretary@${d}` }, ["2026-11-05"]).askedOf, ["role:office", `secretary@${d}`]);
  assert.equal(sr.offPortal(calendarOnly), true);
  assert.equal(sr.offPortal(oneTime), false);
});

test("the office can answer any ask about a booking made off the portal, even one asked before the office answered for them", () => {
  const old: sr.SlotRequest = { ...ask({ ...calendarOnly, organizerEmail: `secretary@${d}` }, ["2026-11-05"]), askedOf: [`secretary@${d}`], deciders: [`secretary@${d}`] };
  assert.equal(sr.canDecide(old, office), true);
  assert.equal(sr.canDecide(old, stranger), false);
  // A portal booking still waits on its holder, not the office.
  assert.equal(sr.canDecide(ask(oneTime, ["2026-11-07"]), office), false);
  // The daily job sends it to the office, once.
  assert.equal(sr.followUp(old, T(0)), "office");
  const routed = sr.routeToOffice(old, T(0));
  assert.deepEqual(routed.deciders.sort(), ["role:office", `secretary@${d}`].sort());
  assert.equal(sr.followUp(routed, T(0)), null);
  const n = sr.slotNotices(old, routed, "portal");
  assert.deepEqual(n.map((x) => [x.to, x.alert]), [[{ role: "office" }, true]]);
  assert.match(n[0].text, /booked on the IAR calendar/);
});

test("an ask nobody answers closes after 10 days, or a week before the event, and gives nothing up", () => {
  const r = ask(oneTime, ["2026-11-07"]);
  assert.equal(sr.closesOn(r), "2026-11-11");
  assert.equal(sr.closesOn(r, "2026-11-14"), "2026-11-07");
  assert.equal(sr.followUp(r, T(2), sr.SLOT_TIMING, { eventDate: "2026-11-30", today: "2026-11-03" }), null);
  assert.equal(sr.followUp(r, T(2), sr.SLOT_TIMING, { eventDate: "2026-11-09", today: "2026-11-03" }), "expire");
  assert.equal(sr.followUp(sr.escalate(r, dir, T(6)), T(10)), "expire");
  const closed = sr.expire(r, T(10));
  assert.equal(closed.status, "expired");
  assert.equal(sr.isOpenAsk(closed), false);
  assert.equal(sr.canDecide(closed, owner), false);
  const n = sr.slotNotices(r, closed, "portal");
  assert.ok(n.some((x) => "email" in x.to && x.to.email === requester.email && x.alert));
  assert.ok(n.filter((x) => !("email" in x.to && x.to.email === requester.email)).every((x) => !x.alert));
});

test("your own booking, and dates it isn't booked, can't be asked for", () => {
  assert.equal(sr.checkAsk(oneTime, ["2026-11-07"], owner.email, []).ok, false);
  assert.equal(sr.checkAsk(oneTime, ["2026-11-08"], requester.email, []).ok, false);
  assert.equal(sr.checkAsk(oneTime, [], requester.email, []).ok, false);
  const noReason = sr.newSlotRequest({ fromCard: "EV-1061", requester, hold: oneTime, dates: ["2026-11-07"], reason: "  " }, dir, [], T(0));
  assert.equal(noReason.ok, false);
});

test("one open ask per booking and date; a kept date can't be asked again", () => {
  const first = ask(series, ["2026-11-10", "2026-11-17"]);
  const again = sr.checkAsk(series, ["2026-11-17"], `other@${d}`, [first]);
  assert.equal(again.ok, false);
  assert.equal(sr.checkAsk(series, ["2026-11-24"], `other@${d}`, [first]).ok, true);
  const kept = decided(first, owner, "keep").request;
  assert.equal(sr.checkAsk(series, ["2026-11-10"], `other@${d}`, [kept]).ok, false);
  const withdrawn = sr.withdraw(first, requester, T(1));
  assert.ok(withdrawn.ok);
  assert.equal(sr.checkAsk(series, ["2026-11-10"], `other@${d}`, [withdrawn.value]).ok, true);
});

test("only the people asked can decide; never the requester or someone else", () => {
  const r = ask(oneTime, ["2026-11-07"]);
  assert.equal(sr.canDecide(r, owner), true);
  assert.equal(sr.canDecide(r, ychair), true);
  assert.equal(sr.canDecide(r, director), false);
  assert.equal(sr.canDecide(r, requester), false);
  assert.equal(sr.canDecide(r, stranger), false);
  assert.equal(sr.decide(r, stranger, "keep", "", T(1)).ok, false);
  const cal = ask(calendarOnly, ["2026-11-05"]);
  assert.equal(sr.canDecide(cal, office), true);
});

test("keep: the requester's card goes back for another time, and nothing changes on the calendar", () => {
  const out = decided(ask(oneTime, ["2026-11-07"]), owner, "keep", "Tickets already sold");
  assert.equal(out.request.status, "kept");
  assert.deepEqual(out.requester, { action: "changes", note: "Tickets already sold" });
  assert.deepEqual(out.owner, { action: "none" });
  assert.deepEqual(out.calendar, []);
});

test("one-time event given up and moved: the calendar entry is freed and the owner's card opens for editing", () => {
  const out = decided(ask(oneTime, ["2026-11-07"]), owner, "release_move");
  assert.equal(out.request.status, "released");
  assert.deepEqual(out.owner, { action: "edit", releasedFor: "SR-1", dates: ["2026-11-07"] });
  assert.deepEqual(out.requester, { action: "to_review" });
  assert.deepEqual(out.calendar, [{ op: "delete", eventId: "cal1031" }]);
});

test("one-time event given up and cancelled: the whole card is cancelled", () => {
  const out = decided(ask(oneTime, ["2026-11-07"]), ychair, "release_cancel");
  assert.deepEqual(out.owner, { action: "cancel" });
  assert.match(out.request.history.at(-1)!.text, /on behalf of yvol@/);
});

test("series: only the clashing dates are given up", () => {
  const out = decided(ask(series, ["2026-11-10", "2026-11-24"]), owner, "release_cancel");
  assert.deepEqual(out.owner, { action: "drop_dates", dates: ["2026-11-10", "2026-11-24"] });
  assert.deepEqual(out.calendar, [
    { op: "cancel_occurrence", eventId: "cal1022", date: "2026-11-10" },
    { op: "cancel_occurrence", eventId: "cal1022", date: "2026-11-24" },
  ]);
});

test("series: giving up the last dates ends it early; giving up every date deletes it", () => {
  assert.deepEqual(sr.calendarOpsFor({ ...series, pending: false }, ["2026-12-01", "2026-12-08"]), [{ op: "end_series", eventId: "cal1022", lastDate: "2026-11-24" }]);
  assert.deepEqual(sr.calendarOpsFor({ ...series, pending: false }, TUESDAYS), [{ op: "delete", eventId: "cal1022" }]);
  const all = decided(ask(series, TUESDAYS), owner, "release_cancel");
  assert.deepEqual(all.owner, { action: "cancel" });
});

test("a calendar-only entry can be given up or kept, not moved", () => {
  const r = ask(calendarOnly, ["2026-11-05"]);
  assert.equal(sr.decide(r, office, "release_move", "", T(1)).ok, false);
  const out = decided(r, office, "release_cancel");
  assert.deepEqual(out.owner, { action: "none" });
  assert.deepEqual(out.calendar, [{ op: "delete", eventId: "calShura" }]);
});

test("a moved event needs only the pillar director, or nobody when there isn't one", () => {
  assert.equal(sr.resubmitStage({ ownerEmail: owner.email, releasedFor: "SR-1" }, [director.email]), "director");
  assert.equal(sr.afterDirector({ releasedFor: "SR-1" }), "approved");
  assert.equal(sr.resubmitStage({ ownerEmail: owner.email, releasedFor: "SR-1" }, []), "approved");
  assert.equal(sr.resubmitStage({ ownerEmail: director.email, releasedFor: "SR-1" }, [director.email]), "approved");
  // A normal resubmit still goes through both steps.
  assert.equal(sr.resubmitStage({ ownerEmail: owner.email }, [director.email]), "director");
  assert.equal(sr.afterDirector({}), "mission");
  assert.equal(sr.resubmitStage({ ownerEmail: owner.email }, []), "mission");
});

test("no answer: a reminder at 3 days, then the pillar director decides at 6", () => {
  const r = ask(oneTime, ["2026-11-07"]);
  assert.equal(sr.followUp(r, T(2)), null);
  assert.equal(sr.followUp(r, T(3)), "remind");
  const reminded = sr.markReminded(r, T(3));
  assert.equal(sr.followUp(reminded, T(4)), null);
  assert.equal(sr.followUp(reminded, T(6)), "escalate");
  const up = sr.escalate(reminded, dir, T(6));
  assert.equal(up.status, "escalated");
  assert.deepEqual(up.escalatedTo, [director.email]);
  assert.equal(sr.followUp(up, T(9)), null);
  assert.equal(sr.canDecide(up, director), true);
  assert.equal(sr.canDecide(up, owner), true);
  const out = decided(up, director, "release_move");
  assert.equal(out.request.decidedBy, director.email);
  assert.match(out.request.history.at(-1)!.text, /decided by the director/);
});

test("no pillar director: the executive decides", () => {
  const r = ask({ ...oneTime, committeeGroup: women, ownerEmail: `wvol@${d}` }, ["2026-11-07"]);
  const other = { ...r, requesterEmail: `x@${d}` };
  const up = sr.escalate(other, dir, T(6));
  assert.deepEqual(up.escalatedTo, ["role:executive"]);
  assert.equal(sr.canDecide(up, exec), true);
});

test("notices: the people asked get an alert; the requester hears the answer", () => {
  const r = ask(oneTime, ["2026-11-07"]);
  const created = sr.slotNotices(null, r, requester.email);
  assert.equal(created.length, 3);
  assert.ok(created.every((n) => n.alert && n.href === "/events/EV-1031"));

  const kept = decided(r, owner, "keep", "Tickets sold").request;
  const keptN = sr.slotNotices(r, kept, owner.email);
  assert.deepEqual(keptN.map((n) => [n.to, n.alert]), [[{ email: requester.email }, true]]);
  assert.match(keptN[0].text, /Tickets sold/);

  const byChair = decided(r, ychair, "release_move").request;
  const relN = sr.slotNotices(r, byChair, ychair.email);
  assert.deepEqual(relN.map((n) => [n.to, n.alert]), [[{ email: requester.email }, false], [{ email: owner.email }, true]]);

  const up = sr.escalate(r, dir, T(6));
  const upN = sr.slotNotices(r, up, "portal");
  assert.deepEqual(upN.filter((n) => n.alert).map((n) => n.to), [{ email: director.email }]);
});
