/**
 * Portal-wide rules: out of office and search. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { type Away, checkAway, coveringFor, isActive } from "./away";
import type { Card } from "./cards";
import { KINDS, hrefOf } from "./kinds";
import { MODULE_TYPES } from "./registry";
import { internalPath } from "./links";
import { mayUsePortal } from "./org";
import { matchCards, requestNumber } from "./search";
import { todayLocal } from "./dates";

const me = { email: "chair@x.org", name: "Chair" };
const ctx = { today: "2026-10-21", domain: "x.org", now: "2026-10-21T14:00:00Z" };
const away = (over: Partial<Away> = {}): Away => ({ email: "chair@x.org", name: "Chair", from: "2026-10-25", until: "2026-11-05", delegate: "backup@x.org", setAt: ctx.now, ...over });

test("away: a valid handoff is saved with a lowercased delegate", () => {
  const r = checkAway({ from: "2026-10-25", until: "2026-11-05", delegate: " Backup@X.org ", note: "Umrah" }, me, ctx);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.away, { email: "chair@x.org", name: "Chair", from: "2026-10-25", until: "2026-11-05", delegate: "backup@x.org", note: "Umrah", setAt: ctx.now });
});

test("away: dates, the domain, yourself and an away delegate are all checked", () => {
  const bad = (input: Parameters<typeof checkAway>[0], extra = {}) => {
    const r = checkAway(input, me, { ...ctx, ...extra });
    assert.equal(r.ok, false, JSON.stringify(input));
  };
  bad({ from: "2026-10-25", until: "2026-10-20", delegate: "backup@x.org" });
  bad({ from: "2026-10-01", until: "2026-10-10", delegate: "backup@x.org" });
  bad({ from: "2026-10-25", until: "2027-06-01", delegate: "backup@x.org" });
  bad({ from: "2026-02-30", until: "2026-11-05", delegate: "backup@x.org" });
  bad({ from: "2026-10-25", until: "2026-11-05", delegate: "someone@gmail.com" });
  bad({ from: "2026-10-25", until: "2026-11-05", delegate: "chair@x.org" });
  bad({ from: "2026-10-25", until: "2026-11-05", delegate: "backup@x.org" }, { delegateAway: away({ email: "backup@x.org", from: "2026-11-01", until: "2026-11-10", delegate: "other@x.org" }) });
  // A delegate who is away at some other time is fine.
  assert.ok(checkAway({ from: "2026-10-25", until: "2026-11-05", delegate: "backup@x.org" }, me, { ...ctx, delegateAway: away({ email: "backup@x.org", from: "2026-12-01", until: "2026-12-10" }) }).ok);
});

test("away: a start date in the past starts today", () => {
  const r = checkAway({ from: "2026-10-01", until: "2026-10-30", delegate: "backup@x.org" }, me, ctx);
  assert.ok(r.ok && r.away.from === "2026-10-21");
});

test("away: covering is active only on the days away, first and last included", () => {
  const a = away();
  assert.equal(isActive(a, "2026-10-24"), false);
  assert.equal(isActive(a, "2026-10-25"), true);
  assert.equal(isActive(a, "2026-11-05"), true);
  assert.equal(isActive(a, "2026-11-06"), false);
  const list = [a, away({ email: "other@x.org", delegate: "someone@x.org" })];
  assert.deepEqual(coveringFor(list, "BACKUP@x.org", "2026-10-30"), ["chair@x.org"]);
  assert.deepEqual(coveringFor(list, "backup@x.org", "2026-11-06"), []);
});

test("away: 'today' is Raleigh's date, not UTC's", () => {
  // 11:30 PM in Raleigh on Oct 21 is already Oct 22 in UTC.
  assert.equal(todayLocal(new Date("2026-10-22T03:30:00Z")), "2026-10-21");
});

const card = (id: string, title: string, over: Partial<Card> = {}): Card => ({
  id, orgId: "iar", type: "purchase", title, status: "in_review", ownerEmail: "vol@x.org", committee: "Youth Expenses", updatedAt: "2026-10-01T00:00:00Z", ...over,
});

test("search: request numbers are read however people type them", () => {
  assert.equal(requestNumber("PO-12001"), "PO-12001");
  assert.equal(requestNumber("po 12001"), "PO-12001");
  assert.equal(requestNumber("12001"), "PO-12001");
  assert.equal(requestNumber("ev-1042"), "EV-1042");
  assert.equal(requestNumber("youth night"), null);
  assert.equal(requestNumber("1101"), null, "below the PO range there's no prefix to guess");
});

test("search: a bare number finds the event, marketing or ticket with it", () => {
  const cards = [card("EV-1101", "Family Night", { type: "event" }), card("TK-1101", "Leak in Room 250", { type: "ticket" }), card("PO-12001", "Supplies")];
  assert.deepEqual(matchCards(cards, "1101").map((c) => c.id).sort(), ["EV-1101", "TK-1101"]);
  assert.deepEqual(matchCards(cards, "ev 1101").map((c) => c.id), ["EV-1101"]);
});

test("links: each kind of request opens its own page", () => {
  assert.equal(hrefOf({ id: "PO-12001", type: "purchase" }), "/purchases/PO-12001");
  assert.equal(hrefOf({ id: "EV-1101", type: "event" }), "/events/EV-1101");
  assert.equal(hrefOf({ id: "MK-1001", type: "marketing" }), "/marketing/MK-1001");
  assert.equal(hrefOf({ id: "TK-1001", type: "ticket" }), "/it-maintenance/TK-1001");
  assert.equal(hrefOf({ id: "RN-1", type: "rental" }), null);
});

test("search: every word must match; the exact number comes first", () => {
  const cards = [
    card("PO-12002", "Youth night pizza", { updatedAt: "2026-10-05T00:00:00Z" }),
    card("PO-12001", "Youth night supplies"),
    card("PO-12003", "Cleaning supplies", { committee: "Cleaning Committee Expenses" }),
  ];
  assert.deepEqual(matchCards(cards, "youth supplies").map((c) => c.id), ["PO-12001"]);
  assert.deepEqual(matchCards(cards, "supplies").map((c) => c.id), ["PO-12001", "PO-12003"]);
  assert.deepEqual(matchCards(cards, "po-12003").map((c) => c.id), ["PO-12003"]);
  assert.deepEqual(matchCards(cards, "   ").map((c) => c.id), []);
});

test("links: only paths inside the portal are followed", () => {
  assert.equal(internalPath("/purchases/PO-1"), "/purchases/PO-1");
  for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "purchases", "/a\r\nSet-Cookie: x"]) assert.equal(internalPath(bad), null, bad);
});

test("access gate: only the access group and portal admins get in while it's set", () => {
  const before = process.env.PORTAL_ACCESS_GROUP;
  try {
    delete process.env.PORTAL_ACCESS_GROUP;
    assert.equal(mayUsePortal([]), true);
    process.env.PORTAL_ACCESS_GROUP = "Portal-Role-Beta@islam1.org";
    assert.equal(mayUsePortal([]), false);
    assert.equal(mayUsePortal(["portal-role-beta@islam1.org"]), true);
    assert.equal(mayUsePortal(["portal-role-admin@islam1.org"]), true);
    assert.equal(mayUsePortal(["portal-role-finance@islam1.org"]), false);
  } finally {
    if (before === undefined) delete process.env.PORTAL_ACCESS_GROUP;
    else process.env.PORTAL_ACCESS_GROUP = before;
  }
});

test("registry: every kind of request has a module, and every module a kind", () => {
  assert.deepEqual([...MODULE_TYPES].sort(), KINDS.map((k) => k.type).sort());
});
