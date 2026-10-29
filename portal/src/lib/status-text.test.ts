/**
 * The words on list pills: what's needed from the person looking, who has the
 * request, or how it ended, for every kind of request. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Card } from "./cards";
import { rowStatusText, statusText } from "./status-text";

const card = (o: Partial<Card>): Card => ({ id: "X-1", orgId: "iar", type: "event", title: "T", status: "in_review", ownerEmail: "vol@x.org", committee: "Youth", updatedAt: "2026-10-20T10:00:00Z", ...o });
const purchase = (stage: string, o: Partial<Card> = {}) => card({ type: "purchase", purchase: { stage } as never, ...o });
const event = (stage: string, o: Partial<Card> = {}) => card({ type: "event", event: { stage } as never, ...o });
const marketing = (stage: string) => card({ type: "marketing", status: "approved", marketing: { stage } as never });
const ticket = (status: string, team = "facilities") => card({ type: "ticket", ticket: { status, team } as never });

test("payments: what's needed from you, or who has it, or how it ended", () => {
  assert.equal(rowStatusText(purchase("chair"), "act"), "Needs your approval");
  assert.equal(rowStatusText(purchase("chair"), "wait"), "With the chair");
  assert.equal(rowStatusText(purchase("finance"), "wait"), "With finance");
  assert.equal(rowStatusText(purchase("payment"), "act"), "Ready for you to pay");
  assert.equal(rowStatusText(purchase("chair", { status: "changes_requested" }), "act"), "Needs changes from you");
  assert.equal(rowStatusText(purchase("chair", { status: "changes_requested" }), "wait"), "With the requester");
  assert.equal(rowStatusText(purchase("done", { status: "paid" }), "done"), "Paid");
  assert.equal(rowStatusText(purchase("chair", { status: "denied" }), "bad"), "Turned down");
});

test("events: reviews, close-out and room answers say who has them", () => {
  assert.equal(rowStatusText(event("director"), "act"), "Needs your approval");
  assert.equal(rowStatusText(event("director"), "wait"), "With the director");
  assert.equal(rowStatusText(event("mission"), "wait"), "With the executives");
  assert.equal(rowStatusText(event("slot"), "wait"), "Waiting on a room answer");
  assert.equal(rowStatusText(event("approved", { status: "close_out" }), "act"), "Needs your close-out");
  assert.equal(rowStatusText(event("approved", { status: "approved" }), "done"), "Approved");
});

test("marketing and AV/IT/Maintenance", () => {
  assert.equal(rowStatusText(marketing("review"), "wait"), "With the marketing team");
  assert.equal(rowStatusText(marketing("question"), "act"), "Needs an answer from you");
  assert.equal(rowStatusText(marketing("done"), "done"), "Done");
  assert.equal(rowStatusText(ticket("new"), "wait"), "With Facility Maintenance");
  assert.equal(rowStatusText(ticket("assigned", "it"), "bad"), "Late: with IT Services");
  assert.equal(rowStatusText(ticket("resolved"), "act"), "Fixed: needs your OK");
  assert.equal(rowStatusText(ticket("reopened"), "bad"), "Reopened");
});

test("request pages and alerts keep the plain status", () => {
  assert.equal(statusText(purchase("finance")), "In review");
  assert.equal(statusText(event("director")), "Director review");
});

test("payments: approved but not paid yet says so to everyone who isn't paying it", () => {
  assert.equal(rowStatusText(purchase("payment", { status: "approved" }), "done"), "Approved, to pay");
  assert.equal(rowStatusText(purchase("books", { status: "paid" }), "done"), "Paid");
});
