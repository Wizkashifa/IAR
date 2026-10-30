/**
 * What's stuck: how long each request has waited, who it's waiting on, and
 * the once-a-day reminder. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePurchaseInput, type PurchaseInput } from "./purchases/input";
import * as pw from "./purchases/workflow";
import { followUps } from "./purchases/reminders";
import type { EventInput } from "./events/types";
import * as ew from "./events/workflow";
import { startCloseOut } from "./events/closeout";
import { parseMarketingInput } from "./marketing/forms";
import * as mw from "./marketing/workflow";
import * as tw from "./tickets/workflow";
import {
  REMINDER_ACTION,
  ageGroup,
  canRemind,
  daysSince,
  groupByAge,
  holderOf,
  lastReminder,
  mayOpenStuck,
  reminderNotices,
  stuckItems,
  waitingSince,
  whoWaiting,
  withReminder,
} from "./stuck";

const vol: pw.Actor = { email: "vol@x.org", name: "Vol Unteer", roles: ["member"] };
const chair: pw.Actor = { email: "chair@x.org", name: "Chair", roles: ["member", "chairs"] };
const fin: pw.Actor = { email: "fin@x.org", name: "Fin", roles: ["member", "finance"] };
const exec: pw.Actor = { email: "exec@x.org", name: "Exec", roles: ["member", "executive"] };
const director: pw.Actor = { email: "dir@x.org", name: "Dee Rector", roles: ["member"] };
const mk: pw.Actor = { email: "mk@x.org", name: "Mark Eting", roles: ["member", "marketing"] };
const fac: tw.TicketActor = { email: "fac@x.org", name: "Fac Staff", roles: ["member", "facilities"] };
const office = { email: "office@x.org", name: "Office Person" };

const NAMES: Record<string, string> = { "vol@x.org": "Vol Unteer", "chair@x.org": "Ali Chair", "dir@x.org": "Dee Rector", "fac@x.org": "Fac Staff" };
const names = (e: string) => NAMES[e] ?? e;
const T = (n: number, h = 14) => new Date(Date.UTC(2026, 9, 1 + n, h)).toISOString();
const DIRS = [director.email];
const ctx = { directorsOf: () => DIRS };

const settings: pw.RoutingSettings = { approversFor: () => ({ chairs: [chair.email] }), executiveThreshold: 2500 };

function purchase(over: Partial<PurchaseInput> = {}): pw.PurchaseCard {
  const input: PurchaseInput = {
    kind: "pay",
    fund: "Youth Expenses",
    description: "Youth night supplies",
    payee: "Known Vendor",
    delivery: "committee_box",
    mailingAddress: "1 Main St, Raleigh, NC 27601",
    lines: [{ accountId: "a38", amount: "120.50" }],
    attestationName: vol.name,
    ...over,
  };
  const r = parsePurchaseInput(input, { requesterName: vol.name, cards: [], vendors: [{ name: "Known Vendor", w9OnFile: true }] });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const c = pw.newPurchase(r.details, vol.email, T(0));
  c.id = "PO-1";
  c.committee = "Youth";
  return pw.submit(c, vol, settings, T(0));
}

const eventInput: EventInput = {
  title: "Youth Game Night",
  description: "Board games, a trivia round and dinner for youth and parents. ".repeat(4),
  committeeGroup: "portal-team-youth@x.org",
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
};

function event(directors = DIRS): ew.EventCard {
  const c = ew.newEvent(eventInput, vol, T(0), []);
  c.id = "EV-1";
  return ew.submit(c, vol, directors, T(0));
}

function marketing(): mw.MarketingCard {
  const r = parseMarketingInput({ kind: "graphic", committee: "Youth", answers: { desc: "A certificate for the Quran reading challenge", due: "2026-12-20" } }, { today: "2026-10-01", committees: ["Youth"] });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const c = mw.newMarketing(r.details, vol, T(0));
  c.id = "MK-1";
  return c;
}

function ticket(): tw.TicketCard {
  const c = tw.newTicket({ team: "facilities", kind: "request", title: "Faucet drips", room: "Women's Prayer Hall", urgency: "normal", description: "Left faucet drips." }, vol, T(0));
  c.id = "TK-1";
  return c;
}

test("waiting since: the step's own start, not the request's last update", () => {
  const c = pw.approve(purchase(), chair, settings, T(2));
  assert.equal(c.purchase.stage, "finance");
  assert.equal(waitingSince(c), T(2));
  assert.equal(waitingSince({ ...c, updatedAt: T(9) }), T(2), "an edit or comment doesn't restart the wait");
  assert.equal(daysSince(waitingSince(c), T(9)), 7);
  assert.equal(daysSince(T(5), T(4)), 0, "never below zero");
});

test("waiting since: a reminder (the daily job's or this page's) doesn't restart the wait", () => {
  const c = purchase();
  const [f] = followUps([c], T(4), () => []);
  assert.ok(f, "the daily job reminds the chair at 3 days");
  assert.equal(waitingSince(f.card), T(0));
  assert.equal(waitingSince(withReminder(f.card, office.email, T(5), "Ali Chair")), T(0));
});

test("waiting since: sent back, the wait starts when it went back", () => {
  const back = pw.returnForChanges(purchase(), chair, T(3), "Attach the receipt");
  assert.equal(waitingSince(back), T(3));
  const closing = startCloseOut(ew.approve(ew.approve(event(), director, DIRS, T(1)), exec, DIRS, T(2)), T(40), DIRS);
  assert.equal(waitingSince(closing), T(40));
});

test("who it waits on: purchases follow the daily job's rule", () => {
  const c = purchase();
  assert.deepEqual(holderOf(c), { to: [{ email: chair.email }], step: "Chair approval" });
  const f = pw.approve(c, chair, settings, T(1));
  assert.deepEqual(holderOf(f), { to: [{ role: "finance" }], step: "Finance review" });
  const pay = pw.approve(f, fin, settings, T(2));
  assert.deepEqual(holderOf(pay), { to: [{ role: "finance" }], step: "To pay" });
  assert.equal(holderOf(pw.recordPayment(pay, fin, T(3), "check", "1001")), null, "QuickBooks entry is batch work, not stuck");
  assert.deepEqual(holderOf(pw.returnForChanges(c, chair, T(1), "Fix it")), { to: [{ email: vol.email }], step: "Back with the requester" });
  assert.equal(holderOf(pw.reject(c, chair, T(1), "No")), null);
});

test("who it waits on: events, marketing and tickets", () => {
  const e = event();
  assert.deepEqual(holderOf(e, ctx), { to: [{ email: director.email }], step: "Director review" });
  assert.deepEqual(holderOf(e), { to: [{ role: "executive" }], step: "Director review" }, "no director known: an executive can act");
  const m = ew.approve(e, director, DIRS, T(1));
  assert.deepEqual(holderOf(m, ctx), { to: [{ role: "executive" }], step: "Executive review" });
  assert.equal(holderOf(ew.approve(m, exec, DIRS, T(2)), ctx), null, "approved and before the day: nothing waiting");

  const mc = marketing();
  assert.deepEqual(holderOf(mc), { to: [{ role: "marketing" }], step: "New" });
  assert.deepEqual(holderOf(mw.ask(mc, mk, T(1), "Which logo?")), { to: [{ email: vol.email }], step: "Waiting on the requester" });
  assert.deepEqual(holderOf(mw.start(mw.schedule(mc, mk, T(1), "2026-11-20"), mk, T(2))), { to: [{ email: mk.email }], step: "In progress" });

  const t = ticket();
  assert.deepEqual(holderOf(t), { to: [{ role: "facilities" }], step: "New" });
  const a = tw.assign(t, fac, T(1), fac.email, { facilities: [fac.email], it: [] });
  assert.deepEqual(holderOf(a)?.to, [{ email: fac.email }]);
  const fixed = tw.resolve(tw.start(a, fac, T(2)), fac, T(3), "New cartridge");
  assert.deepEqual(holderOf(fixed)?.to, [{ email: vol.email }], "fixed: the reporter confirms");
});

test("the list: longest wait first, grouped over a week, 3–7 days, under 3 days", () => {
  const old = purchase();
  const mid = { ...marketing(), marketing: { ...marketing().marketing, stageSince: T(4) } };
  const fresh = { ...ticket(), ticket: { ...ticket().ticket, statusSince: T(9) } };
  const done = { ...pw.reject(purchase(), chair, T(1), "No"), id: "PO-2" };
  const items = stuckItems([fresh, done, mid, old, old], T(10), ctx);
  assert.deepEqual(items.map((i) => i.card.id), ["PO-1", "MK-1", "TK-1"], "done requests and repeats left out");
  assert.deepEqual(items.map((i) => i.days), [10, 6, 1]);
  const g = groupByAge(items);
  assert.deepEqual([g.week.length, g.days.length, g.recent.length], [1, 1, 1]);
  assert.equal(ageGroup(7), "week");
  assert.equal(ageGroup(6), "days");
  assert.equal(ageGroup(3), "days");
  assert.equal(ageGroup(2), "recent");
});

test("reminders: once a day per request, recorded in its history", () => {
  const [item] = stuckItems([purchase()], T(5));
  assert.equal(canRemind(item, T(5)), true);
  const after = withReminder(item.card, "Office@x.org", T(5), "Ali Chair");
  assert.equal(after.updatedAt, item.card.updatedAt, "a reminder doesn't count as a change");
  assert.deepEqual(after.purchase!.history.at(-1), { at: T(5), by: "office@x.org", action: REMINDER_ACTION, note: "To Ali Chair" });
  assert.equal(lastReminder(after), T(5));
  assert.equal(canRemind({ ...item, card: after }, T(5, 20)), false, "not again the same day");
  assert.equal(canRemind({ ...item, card: after }, T(6, 14)), true, "a day later it can go again");
  for (const c of [event(), marketing(), ticket()]) {
    const r = withReminder(c, office.email, T(5), "x");
    assert.equal(lastReminder(r), T(5), `${c.id} keeps it in its own history`);
  }
  const [slot] = stuckItems([{ ...event(), event: { ...event().event, stage: "slot" as const } }], T(5));
  assert.equal(canRemind(slot, T(5)), false, "nobody to remind from here: the ask has its own reminders");
});

test("reminder notices: an alert to whoever it waits on, never the sender, Social & Welfare titles kept out", () => {
  const [item] = stuckItems([purchase()], T(5));
  const ns = reminderNotices(item, office);
  assert.equal(ns.length, 1);
  assert.deepEqual(ns[0].to, { email: chair.email });
  assert.equal(ns[0].alert, true);
  assert.equal(ns[0].delegable, true, "goes to whoever covers for an away chair");
  assert.equal(ns[0].href, "/purchases/PO-1");
  assert.equal(ns[0].text, "Reminder from Office Person: PO-1 “Youth night supplies” has waited 5 days for chair approval. Could you take a look?");
  assert.deepEqual(reminderNotices(item, { email: chair.email, name: "Chair" }), [], "nobody reminds themselves");

  const sw = { ...item, card: { ...item.card, purchase: { ...item.card.purchase!, restricted: true } } };
  assert.match(reminderNotices(sw, office)[0].text, /PO-1 \(Social & Welfare request\)/);
  assert.doesNotMatch(reminderNotices(sw, office)[0].text, /Youth night/);

  const [team] = stuckItems([ticket()], T(5));
  assert.deepEqual(reminderNotices(team, office)[0], { to: { role: "facilities" }, cardId: "TK-1", href: "/it-maintenance/TK-1", text: "Reminder from Office Person: TK-1 “Faucet drips” has waited 5 days for new. Could you take a look?", alert: true, delegable: false });
});

test("who's waiting in words, and who can open the page", () => {
  assert.equal(whoWaiting([{ email: "chair@x.org" }], names), "Ali Chair");
  assert.equal(whoWaiting([{ role: "finance" }], names), "the finance office");
  assert.equal(whoWaiting([{ email: "dir@x.org" }, { email: "vol@x.org" }, { role: "executive" }], names), "Dee Rector, Vol Unteer or an executive");
  assert.equal(whoWaiting([], names), "nobody yet");
  assert.equal(mayOpenStuck(["member", "office"]), true);
  assert.equal(mayOpenStuck(["member", "executive"]), true);
  assert.equal(mayOpenStuck(["member", "admins"]), true);
  assert.equal(mayOpenStuck(["member", "chairs", "finance"]), false);
});
