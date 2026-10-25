/**
 * Notification choices: quiet overnight (9 PM to 7 AM Raleigh time, across
 * the clock change), where updates go, and the morning digest. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPrefs, defaultPrefs, deliverAt, digestText, isQuietHours, nextMorning, routeFyi, splitForQuietHours } from "./notify-prefs";

const at = (iso: string) => new Date(iso);

test("notify prefs: quiet overnight is on and updates stay in the portal unless someone changes them", () => {
  assert.deepEqual(defaultPrefs("Sam@X.org"), { email: "sam@x.org", fyi: "portal", quiet: true });
  assert.deepEqual(cleanPrefs("a@x.org", { fyi: "digest", quiet: false }), { email: "a@x.org", fyi: "digest", quiet: false });
  // Anything a form shouldn't send falls back to the defaults.
  assert.deepEqual(cleanPrefs("a@x.org", { fyi: "fax", quiet: "yes" }), { email: "a@x.org", fyi: "portal", quiet: true });
  assert.deepEqual(cleanPrefs("a@x.org", null), defaultPrefs("a@x.org"));
});

test("notify prefs: quiet hours are 9 PM to 7 AM in Raleigh, summer and winter", () => {
  // Summer (EDT, UTC-4): 8:59 PM is 00:59Z, 9 PM is 01:00Z, 6:59 AM is 10:59Z, 7 AM is 11:00Z.
  assert.equal(isQuietHours(at("2026-07-15T00:59:00Z")), false);
  assert.equal(isQuietHours(at("2026-07-15T01:00:00Z")), true);
  assert.equal(isQuietHours(at("2026-07-15T10:59:00Z")), true);
  assert.equal(isQuietHours(at("2026-07-15T11:00:00Z")), false);
  // Winter (EST, UTC-5): 9 PM is 02:00Z, 7 AM is 12:00Z.
  assert.equal(isQuietHours(at("2026-12-15T01:59:00Z")), false);
  assert.equal(isQuietHours(at("2026-12-15T02:00:00Z")), true);
  assert.equal(isQuietHours(at("2026-12-15T11:59:00Z")), true);
  assert.equal(isQuietHours(at("2026-12-15T12:00:00Z")), false);
});

test("notify prefs: held messages go out at the next 7 AM, right across the clock change", () => {
  // 11 PM Oct 24 (EDT) → 7 AM Oct 25 (EDT) = 11:00Z.
  assert.equal(nextMorning(at("2026-10-25T03:00:00Z")).toISOString(), "2026-10-25T11:00:00.000Z");
  // 3 AM the same night → the same morning.
  assert.equal(nextMorning(at("2026-10-25T07:00:00Z")).toISOString(), "2026-10-25T11:00:00.000Z");
  // The clocks go back at 2 AM on Sun, Nov 1, 2026. 10 PM Oct 31 (EDT) → 7 AM Nov 1, which is EST: 12:00Z.
  assert.equal(nextMorning(at("2026-11-01T02:00:00Z")).toISOString(), "2026-11-01T12:00:00.000Z");
  // 1:30 AM (the second one, EST) on Nov 1 → 7 AM that morning.
  assert.equal(nextMorning(at("2026-11-01T06:30:00Z")).toISOString(), "2026-11-01T12:00:00.000Z");
  // The clocks go forward on Sun, Mar 14, 2027. 10 PM Mar 13 (EST) → 7 AM Mar 14 (EDT) = 11:00Z.
  assert.equal(nextMorning(at("2027-03-14T03:00:00Z")).toISOString(), "2027-03-14T11:00:00.000Z");
  // Across a month end: 11 PM Oct 31 → 7 AM Nov 1.
  assert.equal(nextMorning(at("2026-11-01T03:00:00Z")).toISOString(), "2026-11-01T12:00:00.000Z");
});

test("notify prefs: deliverAt holds only overnight and only when quiet overnight is on", () => {
  const night = at("2026-10-25T03:00:00Z"); // 11 PM in Raleigh
  const day = at("2026-10-25T15:00:00Z"); // 11 AM
  assert.equal(deliverAt(day, { quiet: true }), null);
  assert.equal(deliverAt(night, { quiet: false }), null);
  assert.equal(deliverAt(night, { quiet: true })?.toISOString(), "2026-10-25T11:00:00.000Z");
});

test("notify prefs: overnight, messages to people with quiet hours wait; team spaces and night owls don't", () => {
  const night = at("2026-10-25T03:00:00Z"); // 11 PM in Raleigh
  const prefs = (email: string) => ({ quiet: email !== "owl@x.org" });
  const alerts = [{ to: "chair@x.org" }, { to: "role:finance" }, { to: "Owl@X.org" }];
  const r = splitForQuietHours(alerts, night, prefs);
  assert.deepEqual(r.send.map((a) => a.to), ["role:finance", "Owl@X.org"]);
  assert.deepEqual(r.hold.map((h) => [h.alert.to, h.sendAt.toISOString()]), [["chair@x.org", "2026-10-25T11:00:00.000Z"]]);
  // In the day everything goes.
  assert.equal(splitForQuietHours(alerts, at("2026-10-25T15:00:00Z"), prefs).hold.length, 0);
});

test("notify prefs: updates go where the person chose", () => {
  assert.equal(routeFyi({ fyi: "chat" }), "send");
  assert.equal(routeFyi({ fyi: "digest" }), "digest");
  assert.equal(routeFyi({ fyi: "portal" }), "none");
});

test("notify prefs: the digest lists up to eight updates and counts the rest", () => {
  assert.equal(digestText([]), "");
  assert.equal(digestText([{ text: "Halaqa snacks was approved" }]), "Good morning. 1 update on your requests since yesterday:\n• Halaqa snacks was approved");
  const ten = Array.from({ length: 10 }, (_, i) => ({ text: `Update ${i + 1}` }));
  const lines = digestText(ten).split("\n");
  assert.equal(lines[0], "Good morning. 10 updates on your requests since yesterday:");
  assert.equal(lines.length, 10);
  assert.equal(lines[9], "…and 2 more in the portal.");
});
