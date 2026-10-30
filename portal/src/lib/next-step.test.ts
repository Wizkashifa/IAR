/**
 * The step bar, "What happens next", and what's waiting on whom, across every
 * module. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEV_PERSONAS, devDirectory } from "./dev";
import { rolesFromGroups } from "./org";
import { membershipsOf, teamPeople, teamRoles } from "./teams";
import { nextStepText, stepsFor } from "./next-step";
import { fallbackName, type Steps } from "./steps";
import { groupForViewer, needsViewer } from "./needs-you";
import { parsePurchaseInput, type PurchaseInput } from "./purchases/input";
import * as pw from "./purchases/workflow";
import { TEST_UPLOADS, testCharges } from "./purchases/statement-sample";
import type { EventInput } from "./events/types";
import * as ew from "./events/workflow";
import { startCloseOut } from "./events/closeout";
import { parseMarketingInput, type MarketingInput } from "./marketing/forms";
import * as mw from "./marketing/workflow";
import * as tw from "./tickets/workflow";

// ---- People ---------------------------------------------------------------------

const vol: pw.Actor = { email: "vol@x.org", name: "Vol Unteer", roles: ["member"] };
const chair: pw.Actor = { email: "chair@x.org", name: "Chair", roles: ["member", "chairs"] };
const backup: pw.Actor = { email: "backup@x.org", name: "Backup", roles: ["member"] };
const fin: pw.Actor = { email: "fin@x.org", name: "Fin", roles: ["member", "finance"] };
const exec: pw.Actor = { email: "exec@x.org", name: "Exec", roles: ["member", "executive"] };
const director: pw.Actor = { email: "dir@x.org", name: "Dee Rector", roles: ["member"] };
const mk: pw.Actor = { email: "mk@x.org", name: "Mark Eting", roles: ["member", "marketing"] };
const mk2: pw.Actor = { email: "mk2@x.org", name: "Second Marketer", roles: ["member", "marketing"] };
const fac: tw.TicketActor = { email: "fac@x.org", name: "Fac Staff", roles: ["member", "facilities"] };
const fac2: tw.TicketActor = { email: "fac2@x.org", name: "Fac Two", roles: ["member", "facilities"] };
const office: pw.Actor = { email: "office@x.org", name: "Office", roles: ["member", "office"] };

const NAMES: Record<string, string> = { "vol@x.org": "Vol Unteer", "chair@x.org": "Ali Chair", "backup@x.org": "Bea Backup", "dir@x.org": "Dee Rector", "mk@x.org": "Mark Eting", "fac@x.org": "Fac Staff" };
const names = (e: string) => NAMES[e] ?? fallbackName(e);
const T = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 14)).toISOString();

const labels = (s: Steps) => s.steps.map((x) => x.label);
const at = (s: Steps) => s.steps.find((x) => x.state === "now")?.label;
const states = (s: Steps) => Object.fromEntries(s.steps.map((x) => [x.label, x.state]));

// ---- Purchases --------------------------------------------------------------------

const settings: pw.RoutingSettings = {
  approversFor: (fund) => (fund === "Women Expenses" ? {} : { chairs: [chair.email], backups: [backup.email] }),
  executiveThreshold: 2500,
};
const pctx = { requesterName: vol.name, cards: [{ last4: "2093" }], vendors: [{ name: "Known Vendor", w9OnFile: true }] };

function purchase(over: Partial<PurchaseInput> = {}, owner = vol, statement?: ReturnType<typeof testCharges>["statement"]): pw.PurchaseCard {
  const input: PurchaseInput = {
    kind: "pay",
    fund: "Youth Expenses",
    description: "Youth night supplies",
    payee: "Known Vendor",
    delivery: "committee_box",
    mailingAddress: "1 Main St, Raleigh, NC 27601",
    lines: [{ accountId: "a38", amount: "120.50" }],
    attestationName: owner.name,
    ...over,
  };
  const r = parsePurchaseInput(input, { ...pctx, requesterName: owner.name, statement, uploads: TEST_UPLOADS, requesterEmail: owner.email });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const c = pw.newPurchase(r.details, owner.email, T(0));
  c.id = "PO-1";
  c.committee = "Youth";
  return pw.submit(c, owner, settings, T(0));
}

test("purchase steps: submitted → chair → finance → to pay → paid, and the executive step only when it applies", () => {
  const c = purchase();
  const s = stepsFor(c, { executiveThreshold: 2500 });
  assert.deepEqual(labels(s), ["Submitted", "Chair approval", "Finance review", "To pay", "Paid"]);
  assert.equal(at(s), "Chair approval");
  assert.equal(states(s)["Submitted"], "done");

  const big = purchase({ lines: [{ accountId: "a38", amount: "3000" }] });
  assert.ok(labels(stepsFor(big, { executiveThreshold: 2500 })).includes("Executive approval"));
  assert.ok(!labels(stepsFor(big)).includes("Executive approval"), "no threshold given: shown only once it gets there");

  const f = pw.approve(c, chair, settings, T(1));
  assert.equal(at(stepsFor(f)), "Finance review");
  const toPay = pw.approve(f, fin, settings, T(2));
  assert.equal(at(stepsFor(toPay)), "To pay");
  const paid = pw.recordPayment(toPay, fin, T(3), "check", "1042");
  assert.ok(stepsFor(paid).steps.every((x) => x.state === "done"), "paid: every step done");
});

test("purchase steps: straight to finance skips the chair; card receipts have their own steps", () => {
  const noChair = purchase({ fund: "Women Expenses" });
  assert.equal(noChair.purchase.stage, "finance");
  assert.equal(states(stepsFor(noChair))["Chair approval"], "skip");

  const t = testCharges([{ date: "2026-09-02", description: "USPS", amount: 9.57, line: { accountId: "a76" } }]);
  const card = purchase({ kind: "card", fund: "Youth Expenses", cardLast4: "2093", statementMonth: "2026-09", lines: t.lines }, vol, t.statement);
  assert.deepEqual(labels(stepsFor(card)), ["Submitted", "Finance review", "Entered in QuickBooks"]);
});

test("purchase steps: sent back is flagged, declined and withdrawn skip what's left", () => {
  const back = pw.returnForChanges(purchase(), chair, T(1), "Attach the receipt");
  assert.deepEqual(stepsFor(back).flag, { label: "Sent back for changes", tone: "warn" });
  const denied = pw.reject(purchase(), chair, T(1), "Not in the budget");
  const s = stepsFor(denied);
  assert.deepEqual(s.flag, { label: "Declined", tone: "bad" });
  assert.equal(states(s)["Chair approval"], "skip");
  assert.equal(stepsFor(pw.cancel(purchase(), vol, T(1))).flag?.label, "Withdrawn");
});

test("purchase next step: 'You' only for the person who acts; the notification line only for the requester", () => {
  const c = purchase();
  assert.equal(nextStepText(c, vol, names), "Ali Chair approves it for Youth, then the finance office reviews it. You'll be notified when it's done.");
  assert.equal(nextStepText(c, chair, names), "You approve it for Youth, then the finance office reviews it.");
  assert.equal(nextStepText(c, fin, names), "Ali Chair approves it for Youth, then the finance office reviews it.");

  // The bug this replaces: the saved text says "You:" meaning the requester.
  const back = pw.returnForChanges(c, chair, T(1), "Attach the receipt");
  assert.match(back.waitingOn ?? "", /^You:/);
  assert.equal(nextStepText(back, vol, names), "You make the changes asked for (“Attach the receipt”) and send it again.");
  assert.equal(nextStepText(back, chair, names), "Vol Unteer makes the changes asked for (“Attach the receipt”) and sends it again.");

  const toPay = pw.approve(pw.approve(c, chair, settings, T(1)), fin, settings, T(2));
  assert.equal(nextStepText(toPay, vol, names), "The finance office pays Known Vendor. You'll be notified when it's paid.");
  assert.equal(nextStepText(pw.reject(c, chair, T(1), "No"), vol, names), "");
});

test("purchase needs: the named chair, then finance; never the requester's own approval", () => {
  const c = purchase();
  assert.equal(needsViewer(c, chair), true);
  assert.equal(needsViewer(c, vol), false);
  assert.equal(needsViewer(c, fin), false);
  const f = pw.approve(c, chair, settings, T(1));
  assert.equal(needsViewer(f, chair), false);
  assert.equal(needsViewer(f, fin), true);
  assert.equal(needsViewer(pw.returnForChanges(c, chair, T(1), "Fix it"), vol), true, "sent back: the requester");
});

// ---- Events -----------------------------------------------------------------------

const eventInput = (over: Partial<EventInput> = {}): EventInput => ({
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
  ...over,
});
const DIRS = [director.email];

function event(directors = DIRS, owner = vol): ew.EventCard {
  const c = ew.newEvent(eventInput(), owner, T(0), []);
  c.id = "EV-1";
  return ew.submit(c, owner, directors, T(0));
}

test("event steps: director → executive → approved → event day → close-out → closed", () => {
  const c = event();
  const s = stepsFor(c, { directors: DIRS, today: "2026-10-23" });
  assert.deepEqual(labels(s), ["Submitted", "Director review", "Executive review", "Approved", "Event day", "Close-out", "Closed"]);
  assert.equal(at(s), "Director review");
  const m = ew.approve(c, director, DIRS, T(1));
  assert.equal(at(stepsFor(m, { today: "2026-10-23" })), "Executive review");
  const ok = ew.approve(m, exec, DIRS, T(2));
  assert.equal(at(stepsFor(ok, { today: "2026-10-23" })), "Event day");
  assert.equal(at(stepsFor(ok, { today: "2026-11-20" })), "Close-out", "after the day, it waits on close-out");
  assert.equal(at(stepsFor(startCloseOut(ok, T(50), DIRS), { today: "2026-11-20" })), "Close-out");
});

test("event steps: no director skips the director step", () => {
  const c = event([]);
  assert.equal(c.event.stage, "mission");
  const s = stepsFor(c, { directors: [] });
  assert.equal(states(s)["Director review"], "skip");
  assert.equal(at(s), "Executive review");
});

test("event next step: the director is named, or told it's theirs; close-out falls to the requester", () => {
  const c = event();
  assert.equal(nextStepText(c, vol, names, { directors: DIRS }), "Dee Rector (director) reviews it against IAR's mission, then an executive gives final approval. You'll be notified when it's done.");
  assert.equal(nextStepText(c, director, names, { directors: DIRS }), "You (director) review it against IAR's mission, then an executive gives final approval.");
  const ok = ew.approve(ew.approve(c, director, DIRS, T(1)), exec, DIRS, T(2));
  assert.equal(nextStepText(ok, vol, names), "After the event, you add the attendance and close it out.", "no Security step any more");
  const closing = startCloseOut(ok, T(50), DIRS);
  assert.equal(nextStepText(closing, vol, names), "You add the attendance and final costs to close it out.");
  assert.equal(nextStepText(closing, exec, names), "Vol Unteer adds the attendance and final costs to close it out.");
});

test("event needs: the director, then any executive; close-out for the requester", () => {
  const ctx = { directorsOf: () => DIRS };
  const c = event();
  assert.equal(needsViewer(c, director, ctx), true);
  assert.equal(needsViewer(c, exec, ctx), false);
  assert.equal(needsViewer(c, director), false, "without the directory nobody is a director");
  const m = ew.approve(c, director, DIRS, T(1));
  assert.equal(needsViewer(m, exec, ctx), true);
  assert.equal(needsViewer(m, director, ctx), false);
  const closing = startCloseOut(ew.approve(m, exec, DIRS, T(2)), T(50), DIRS);
  assert.equal(needsViewer(closing, vol, ctx), true);
});

// ---- Marketing --------------------------------------------------------------------

function marketing(): mw.MarketingCard {
  const input: MarketingInput = { kind: "graphic", committee: "Youth", answers: { desc: "A certificate for the Quran reading challenge", due: "2026-12-20" } };
  const r = parseMarketingInput(input, { today: "2026-10-01", committees: ["Youth"] });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const c = mw.newMarketing(r.details, vol, T(0));
  c.id = "MK-1";
  return c;
}

test("marketing: new, a question back, scheduled, in progress and done", () => {
  const c = marketing();
  assert.equal(at(stepsFor(c)), "New");
  assert.equal(nextStepText(c, mk, names), "The marketing team picks up new requests as they come in.");
  assert.equal(needsViewer(c, mk), true, "the team reviews it");
  assert.equal(needsViewer(c, vol), false);

  const q = mw.ask(c, mk, T(1), "Which logo?");
  assert.deepEqual(stepsFor(q).flag, { label: "Question for the requester", tone: "warn" });
  assert.equal(needsViewer(q, vol), true);
  assert.equal(needsViewer(q, mk), false);
  assert.equal(nextStepText(q, vol, names), "You answer the marketing team's question (“Which logo?”).");
  assert.equal(nextStepText(q, mk, names), "Vol Unteer answers the marketing team's question (“Which logo?”).");

  const sch = mw.schedule(c, mk, T(1), "2026-11-20");
  assert.equal(at(stepsFor(sch)), "Scheduled");
  const doing = mw.start(sch, mk2, T(2));
  assert.equal(needsViewer(doing, mk2), true, "the person working on it");
  assert.equal(needsViewer(doing, mk), false);
  assert.equal(nextStepText(doing, mk2, names), "You are working on it, to be done by Nov 20.");
  assert.equal(nextStepText(doing, vol, names), "Mk2 is working on it, to be done by Nov 20.");
  assert.deepEqual(labels(stepsFor(doing)), ["Submitted", "New", "Scheduled", "In progress", "Approval", "Done"]);

  // Sent Sunday: the requester has until Monday, same time.
  const proof = mw.sendProof(doing, mk2, T(3), [{ name: "draft.png", size: 1 }]);
  assert.equal(at(stepsFor(proof)), "Approval");
  assert.equal(needsViewer(proof, vol), true, "the requester approves");
  assert.equal(needsViewer(proof, mk2), false);
  assert.equal(nextStepText(proof, vol, names), "You approve marketing's draft or ask for changes by Mon, Oct 5, 10:00 AM. With no answer by then, marketing can go ahead.");
  assert.equal(nextStepText(proof, mk2, names), "Vol Unteer approves marketing's draft or asks for changes by Mon, Oct 5, 10:00 AM. With no answer by then, marketing can go ahead.");

  const ready = mw.approve(proof, vol, T(3));
  assert.equal(at(stepsFor(ready)), "Done");
  assert.equal(needsViewer(ready, mk2), true, "the person working on it sends it out");
  assert.equal(needsViewer(ready, vol), false);
  assert.equal(nextStepText(ready, vol, names), "You approved the draft. Mk2 sends it out next.");
  assert.equal(nextStepText(ready, mk2, names), "The requester approved the draft. You send it out next.");

  const done = mw.finish(ready, mk2, T(3));
  assert.ok(stepsFor(done).steps.every((x) => x.state === "done"));
  assert.equal(nextStepText(done, vol, names), "");
});

test("marketing: a short link has no Approval step", () => {
  const r = parseMarketingInput({ kind: "redirect", committee: "Youth", answers: { from: "raleighmasjid.org/youth", to: "https://example.org/youth" } }, { today: "2026-10-01", committees: ["Youth"] });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const c = mw.newMarketing(r.details, vol, T(0));
  assert.deepEqual(labels(stepsFor(c)), ["Submitted", "New", "Scheduled", "In progress", "Done"]);
  const done = mw.finish(mw.schedule(c, mk, T(1), "2026-11-20"), mk, T(2));
  assert.ok(stepsFor(done).steps.every((x) => x.state === "done"));
});

// ---- Tickets ----------------------------------------------------------------------

function ticket(): tw.TicketCard {
  const c = tw.newTicket({ team: "facilities", kind: "request", title: "Faucet drips", room: "Women's Prayer Hall", urgency: "normal", description: "Left faucet drips." }, reporter, T(0));
  c.id = "TK-1";
  return c;
}
const MEMBERS = { facilities: [fac.email, fac2.email], it: [] };
const reporter: tw.TicketActor = { email: vol.email, name: vol.name, roles: vol.roles };

test("tickets: picked up, worked on, fixed, then the reporter confirms", () => {
  const c = ticket();
  assert.deepEqual(labels(stepsFor(c)), ["Reported", "Picked up", "Being worked on", "Fixed", "Closed"]);
  assert.equal(at(stepsFor(c)), "Picked up");
  assert.equal(needsViewer(c, fac), true, "anyone on the team can pick up a new ticket");
  assert.equal(needsViewer(c, office), false);
  assert.equal(nextStepText(c, vol, names), "The Facility Maintenance team picks it up. You'll be notified when it's fixed.");

  const a = tw.assign(c, fac, T(1), fac2.email, MEMBERS);
  assert.equal(needsViewer(a, fac2), true);
  assert.equal(needsViewer(a, fac), false, "assigned to someone else");
  const w = tw.waitForParts(tw.start(a, fac2, T(2)), fac2, T(3), "Cartridge on order");
  assert.deepEqual(stepsFor(w).flag, { label: "Waiting on parts", tone: "warn" });
  assert.equal(nextStepText(w, fac2, names), "You are waiting on parts.");

  const fixed = tw.resolve(w, fac2, T(4), "New cartridge");
  assert.equal(at(stepsFor(fixed)), "Closed");
  assert.equal(needsViewer(fixed, vol), true, "the reporter confirms");
  assert.equal(needsViewer(fixed, fac2), false);
  assert.equal(nextStepText(fixed, vol, names), "Check it's fixed and confirm, or reopen it. It closes by itself after 7 days.");
  assert.equal(nextStepText(fixed, fac2, names), "Vol Unteer checks it's fixed and confirms. It closes by itself after 7 days.");
});

// ---- Grouping --------------------------------------------------------------------

test("groupForViewer: needs you, waiting on others, done; newest first; needing you beats done", () => {
  const mine = purchase();
  const back = { ...pw.returnForChanges(purchase(), chair, T(1), "Fix"), id: "PO-2", updatedAt: T(5) };
  const old = { ...pw.cancel(purchase(), vol, T(1)), id: "PO-3" };
  const tk = { ...ticket(), updatedAt: T(4) };
  const g = groupForViewer([mine, back, old, tk], vol);
  assert.deepEqual(g.needsYou.map((c) => c.id), ["PO-2"]);
  assert.deepEqual(g.waiting.map((c) => c.id), ["TK-1", "PO-1"]);
  assert.deepEqual(g.done.map((c) => c.id), ["PO-3"]);

  // Finance: a paid request still waiting on its QuickBooks entry needs them, not done.
  const paid = pw.recordPayment(pw.approve(pw.approve(purchase(), chair, settings, T(1)), fin, settings, T(2)), fin, T(3), "check", "1");
  assert.equal(paid.status, "paid");
  assert.deepEqual(groupForViewer([paid], fin).needsYou.length, 1);
  assert.deepEqual(groupForViewer([paid], vol).done.length, 1);
});

// ---- Sample users ----------------------------------------------------------------

test("sample users: the Programs director reviews a Youth event; the volunteer who sent it waits", () => {
  const dir = devDirectory();
  const actor = (id: string): pw.Actor => {
    const p = DEV_PERSONAS.find((x) => x.id === id)!;
    return { email: p.email, name: p.name, roles: rolesFromGroups(p.groups, teamRoles(membershipsOf(dir, p.email))) };
  };
  const youth = dir.teams.find((t) => t.name === "Youth")!.email;
  const directorsOf = (g: string) => teamPeople(dir, g).directors;
  assert.ok(directorsOf(youth).length > 0, "Youth sits under a pillar with a director");
  const volunteer = actor("member");
  const c = ew.submit({ ...ew.newEvent(eventInput({ committeeGroup: youth }), volunteer, T(0), []), id: "EV-9" }, volunteer, directorsOf(youth), T(0));
  assert.equal(needsViewer(c, actor("director"), { directorsOf }), true);
  assert.equal(needsViewer(c, actor("executive"), { directorsOf }), false);
  assert.equal(needsViewer(c, volunteer, { directorsOf }), false);
  assert.equal(groupForViewer([c], volunteer, { directorsOf }).waiting.length, 1);
  assert.match(nextStepText(c, volunteer, (e) => DEV_PERSONAS.find((p) => p.email === e)?.name ?? fallbackName(e), { directors: directorsOf(youth) }), /^Sample Director \(director\) reviews it/);
});

test("fallbackName: a readable name from an address", () => {
  assert.equal(fallbackName("fatima.ahmed@islam1.org"), "Fatima Ahmed");
  assert.equal(fallbackName("youth_chair@islam1.org"), "Youth Chair");
});

test("purchase next step: the finance office and executives read 'You' at their own step", () => {
  const c = purchase();
  const atFinance = pw.approve(c, chair, settings, T(1));
  const finViewer = { ...fin, actingRoles: ["finance"] };
  assert.equal(nextStepText(atFinance, finViewer, names), "You check the receipts and accounts, then it's paid.");
  assert.equal(nextStepText(atFinance, vol, names), "The finance office checks the receipts and accounts, then it's paid. You'll be notified when it's done.");
  const atExec = { ...atFinance, purchase: { ...atFinance.purchase, stage: "executive" as const } };
  assert.equal(nextStepText(atExec, { email: "exec@dev.local", actingRoles: ["executive"] }, names), "You approve it as an executive, then the finance office pays it.");
  // Never "You" on your own request, whatever groups you're in.
  assert.equal(nextStepText(atExec, { ...vol, actingRoles: ["executive"] }, names), "An executive approves it, then the finance office pays it. You'll be notified when it's done.");
});
