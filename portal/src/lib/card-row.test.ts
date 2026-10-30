/**
 * List rows for every kind of request, and what waits on someone outside a
 * card's own steps. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Card } from "./cards";
import { cardRow, emailsIn, rowState, subText, whoText } from "./card-row";
import { slotAsksFor, teamTasksFor } from "./needs-you";
import type { Actor } from "./workflow-core";
import type { EventCard } from "./events/workflow";
import type { SlotRequest } from "./events/slot-requests";

const vol: Actor = { email: "vol@x.org", name: "Vol Unteer", roles: ["member"] };
const chair: Actor = { email: "chair@x.org", name: "Ali Chair", roles: ["member", "chairs"] };
const NAMES: Record<string, string> = { "vol@x.org": "Vol Unteer", "chair@x.org": "Ali Chair", "dir@x.org": "Dee Rector" };
const names = (e: string) => NAMES[e] ?? e;

const card = (o: Partial<Card>): Card => ({ id: "EV-1101", orgId: "iar", type: "event", title: "Youth Game Night", status: "in_review", ownerEmail: vol.email, committee: "Youth", updatedAt: "2026-10-20T10:00:00Z", ...o });

test("the requester sees their own words; everyone else sees names, never addresses or 'You'", () => {
  const sent = card({ status: "changes_requested", waitingOn: "You: attach the missing receipt" });
  assert.equal(whoText(sent, vol, names), "You: attach the missing receipt");
  assert.equal(whoText(sent, chair, names), "Vol Unteer: attach the missing receipt");
  const review = card({ waitingOn: "Director review: dir@x.org" });
  assert.equal(whoText(review, chair, names), "Director review: Dee Rector");
  assert.equal(whoText(card({ waitingOn: "Chair approval: chair@x.org" }), chair, names), "Chair approval: you");
  assert.equal(whoText(card({}), chair, names), undefined);
});

test("the supporting line: committee, then the date, amount or place", () => {
  assert.equal(subText(card({ eventDate: "2026-11-21", event: {} as never })), "Youth · Sat, Nov 21");
  assert.equal(subText(card({ type: "purchase", amount: 184.5, purchase: {} as never })), "Youth · $184.50");
  assert.equal(subText(card({ type: "ticket", ticket: { team: "facilities", room: "Main Prayer Hall" } as never })), "Facility Maintenance · Main Prayer Hall");
  assert.equal(subText(card({ type: "marketing", marketing: { kind: "graphic", doneBy: "2026-10-28" } as never })), "Graphic design · Youth · done by Wed, Oct 28");
});

test("edge colour: you act, others act, done, or stopped and late", () => {
  assert.equal(rowState(card({ status: "changes_requested" }), vol), "act");
  assert.equal(rowState(card({ status: "changes_requested" }), chair), "wait");
  assert.equal(rowState(card({ status: "approved" }), chair), "done");
  assert.equal(rowState(card({ status: "closed" }), vol), "done");
  assert.equal(rowState(card({ status: "denied" }), vol), "bad");
  assert.equal(rowState(card({ type: "marketing", status: "approved", marketing: { stage: "doing" } as never }), chair), "wait");
  assert.equal(rowState(card({ type: "marketing", status: "closed", marketing: { stage: "done" } as never }), chair), "done");
  const late = card({ type: "ticket", status: "in_review", ticket: { team: "facilities", status: "assigned", dueDate: "2026-10-01" } as never });
  assert.equal(rowState(late, vol, { today: "2026-10-25" }), "bad");
  assert.equal(rowState(late, vol, { today: "2026-09-25" }), "wait");
});

test("the addresses to look up: requesters and anyone named in who has it", () => {
  assert.deepEqual(emailsIn([card({ waitingOn: "Director review: Dir@x.org" }), card({ ownerEmail: "Chair@x.org" })]).sort(), ["chair@x.org", "dir@x.org", "vol@x.org"]);
});

test("a finished request shows no one holding it", () => {
  const row = cardRow(card({ status: "closed", waitingOn: "Nothing" }), vol, "Closed", { names });
  assert.equal(row.who, undefined);
  assert.equal(row.href, "/events/EV-1101");
  assert.equal(row.state, "done");
});

test("asks for a booked time go to whoever can answer them, oldest first", () => {
  const base = { fromCard: "EV-1061", requesterEmail: "w@x.org", requesterName: "W", hold: {} as never, holdKey: "card:EV-1031", dates: ["2026-11-07"], reason: "", deciders: [], updatedAt: "", history: [] };
  const asks: SlotRequest[] = [
    { ...base, id: "SR-2", askedOf: [chair.email], status: "open", askedAt: "2026-10-22T10:00:00Z" },
    { ...base, id: "SR-1", askedOf: [chair.email], status: "escalated", askedAt: "2026-10-20T10:00:00Z" },
    { ...base, id: "SR-3", askedOf: [chair.email], status: "kept", askedAt: "2026-10-19T10:00:00Z" },
    { ...base, id: "SR-4", askedOf: ["role:office"], status: "open", askedAt: "2026-10-19T10:00:00Z" },
  ];
  assert.deepEqual(slotAsksFor(asks, chair).map((r) => r.id), ["SR-1", "SR-2"]);
  assert.deepEqual(slotAsksFor(asks, { ...vol, roles: ["member", "office"] }).map((r) => r.id), ["SR-4"]);
});

test("team tasks: only the teams you're on, open ones on approved events, soonest first", () => {
  const ev = (id: string, status: Card["status"], tasks: object[]) => card({ id, status, event: { tasks } as never }) as EventCard;
  const cards = [
    ev("EV-1", "approved", [{ id: "t1", team: "av", status: "todo", dueDate: "2026-11-02", history: [] }, { id: "t2", team: "marketing", status: "todo", dueDate: "2026-10-30", history: [] }]),
    ev("EV-2", "approved", [{ id: "t3", team: "av", status: "doing", dueDate: "2026-10-28", history: [] }, { id: "t4", team: "av", status: "done", dueDate: "2026-10-01", history: [] }]),
    ev("EV-3", "in_review", [{ id: "t5", team: "av", status: "locked", dueDate: "2026-10-27", history: [] }]),
  ];
  assert.deepEqual(teamTasksFor(cards, ["member", "av"], "2026-10-25").map((x) => x.task.id), ["t3", "t1"]);
  assert.deepEqual(teamTasksFor(cards, ["member", "office"], "2026-10-25"), []);
});
