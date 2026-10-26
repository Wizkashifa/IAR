/**
 * Names instead of addresses: the readable fallback, the resolver and the
 * cache. Run with `npm test`. (names.ts itself is server-only; its Google
 * lookup is the fetcher handed to NameCache here.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEV_PERSONAS, devDirectory, devNames } from "./dev";
import { NameCache, makeNameResolver, prettifyEmail } from "./name-cache";

test("names: an address alone becomes a readable name", () => {
  assert.equal(prettifyEmail("fatima.ahmed@islam1.org"), "Fatima Ahmed");
  assert.equal(prettifyEmail(" Amina.412.Rahman@x.org "), "Amina Rahman");
  assert.equal(prettifyEmail("abu_bakr-siddiq@x.org"), "Abu Bakr Siddiq");
  assert.equal(prettifyEmail("portal-team-social-welfare@x.org"), "Social Welfare");
  assert.equal(prettifyEmail("portal-role-finance@x.org"), "Finance");
  assert.equal(prettifyEmail("12345@x.org"), "12345@x.org");
});

test("names: the resolver uses known names and falls back for the rest", () => {
  const name = makeNameResolver({ "Chair@X.org": "Sample Chair" });
  assert.equal(name("chair@x.org"), "Sample Chair");
  assert.equal(name(" CHAIR@x.org"), "Sample Chair");
  assert.equal(name("new.volunteer@x.org"), "New Volunteer");
  assert.equal(makeNameResolver(new Map([["a@x.org", "A Person"]]))("a@x.org"), "A Person");
});

test("names: found names are cached for 15 minutes, and one lookup serves everyone asking at once", async () => {
  let t = 0;
  const asked: string[][] = [];
  const cache = new NameCache(async (emails) => {
    asked.push(emails);
    await new Promise((r) => setTimeout(r, 5));
    return Object.fromEntries(emails.map((e) => [e, e.startsWith("chair") ? "Sample Chair" : null]));
  }, { now: () => t });

  const [a, b] = await Promise.all([cache.namesFor(["Chair@x.org", "chair@x.org", "out.side@gmail.com"]), cache.nameOf("chair@x.org")]);
  assert.deepEqual(asked, [["chair@x.org", "out.side@gmail.com"]], "deduplicated, lowercased, one batch");
  assert.equal(a.get("chair@x.org"), "Sample Chair");
  assert.equal(a.get("out.side@gmail.com"), "Out Side", "no name found: readable fallback");
  assert.equal(b, "Sample Chair");

  t = 30 * 1000;
  await cache.namesFor(["chair@x.org", "out.side@gmail.com"]);
  assert.equal(asked.length, 1, "both cached; a miss is kept for a minute");
  t = 14 * 60 * 1000;
  await cache.nameOf("chair@x.org");
  assert.equal(asked.length, 1, "a found name is kept for 15 minutes");
  t = 16 * 60 * 1000;
  await cache.nameOf("chair@x.org");
  assert.equal(asked.length, 2, "asked again after 15 minutes");
});

test("names: a failed lookup never throws, falls back, and is retried a minute later", async () => {
  let t = 0;
  let calls = 0;
  const cache = new NameCache(async () => {
    calls++;
    throw new Error("Google is down");
  }, { now: () => t });
  assert.equal(await cache.nameOf("fatima.ahmed@x.org"), "Fatima Ahmed");
  assert.equal(await cache.nameOf("fatima.ahmed@x.org"), "Fatima Ahmed");
  assert.equal(calls, 1);
  t = 61 * 1000;
  await cache.nameOf("fatima.ahmed@x.org");
  assert.equal(calls, 2);
});

test("names: dev mode has a name for every sample user and team", () => {
  const dir = devDirectory();
  const name = makeNameResolver(devNames());
  for (const p of DEV_PERSONAS) assert.equal(name(p.email), p.name);
  const youth = dir.teams.find((g) => g.name === "Youth")!;
  assert.equal(name(youth.email), "Youth");
});
