/**
 * go-live against the in-memory Google. Run with `npm test`. Nothing here
 * talks to Google.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SETTINGS_DOC, SPACES } from "./config";
import { dnsEmail } from "./email";
import { fieldPath, fromFields, toFields } from "./firestore-values";
import { FakeGoogle } from "./google-fake";
import { DEFAULTS, goLive } from "./go-live";
import { LAUNCH_TEAMS } from "./launch";
import { TAB, templateTabs } from "./sheet";
import { parseArgs } from "./main";
import { readerPrivileges } from "./stages/accounts";
import { sheetIdOf } from "./stages/sheet";
import { matchRooms } from "./stages/rooms";
import { mergeSettings, spacesByRole } from "./stages/settings";
import type { Ask, Options, State } from "./types";

const D = "x.org";
const P = "iar-test";
const PKG = join(__dirname, "..", "..", "..", "..");
const REPO = join(PKG, "..", "..");
const PEOPLE = ["chair@x.org", "vice@x.org", "member@x.org", "books@x.org", "office@x.org", "dir@x.org", "holder@x.org", "tester1@x.org", "tester2@x.org", "admin@x.org"];

function filledSheet(extra: { groups?: string[][]; testers?: string[][] } = {}) {
  const tabs = Object.fromEntries(templateTabs(D).map((t) => [t.name, [t.header, ...t.rows]]));
  tabs[TAB.groups].push(
    ["Youth", "", "chair@x.org", "Owner", ""],
    ["Youth", "", "vice@x.org", "Manager", ""],
    ["Youth", "", "member@x.org", "Member", ""],
    ["Portal: Finance", "", "books@x.org", "Member", ""],
    ["Portal: IAR office", "", "office@x.org", "Member", ""],
    ["Portal: Admins", "", "admin@x.org", "Member", ""],
    ...(extra.groups ?? []),
  );
  tabs[TAB.pillars] = [tabs[TAB.pillars][0], ["Community", "dir@x.org", "Youth, Women's Committee"]];
  tabs[TAB.cards] = [tabs[TAB.cards][0], ["2093", "Card Holder", "holder@x.org", "Youth Expenses"]];
  tabs[TAB.testers] = [tabs[TAB.testers][0], ...(extra.testers ?? [["tester1@x.org", "T1", "chair"], ["tester2@x.org", "T2", "finance"]])];
  const rooms = tabs[TAB.rooms];
  for (const r of rooms.slice(1)) if (r[0] === "Main Prayer Hall" || r[0] === "Room 240 – conference room") r[3] = "Yes";
  return tabs;
}

function setup(o: { ready?: boolean; sheet?: Record<string, string[][]>; freeLicenses?: number } = {}) {
  const fake = new FakeGoogle({
    domain: D,
    project: P,
    ready: o.ready ?? true,
    users: PEOPLE,
    freeLicenses: o.freeLicenses,
    resources: [
      { name: "Main Prayer Hall", email: "c_hall@resource.calendar.google.com" },
      { name: "Room 240 - conference room", email: "c_240@resource.calendar.google.com" },
      { name: "Basement storage", email: "c_store@resource.calendar.google.com" },
    ],
  });
  fake.events.set("c_hall@resource.calendar.google.com", [{ summary: "Jumuah prayer", recurring: true }]);
  fake.putSheet("SHEET1", "IAR Portal members", o.sheet ?? filledSheet());
  return fake;
}

type Answers = { no?: RegExp[] };
function prompter(fake: FakeGoogle, a: Answers = {}) {
  const asked: Ask[] = [];
  const fn = async (q: Ask) => {
    asked.push(q);
    if (q.kind === "enter") {
      fake.byHand(q.step);
      return "";
    }
    if (q.kind === "yesno") return a.no?.some((r) => r.test(q.question)) ? "n" : "y";
    if (q.kind === "secret") return "web-client-secret";
    if (/Billing account ID/.test(q.question)) return fake.billingAccounts[0].id;
    if (/Client ID/.test(q.question)) return fake.webClientId;
    if (/calendar's ID/.test(q.question)) return "events@group.calendar.google.com";
    if (/DNS manager's email/.test(q.question)) return "dns@elsewhere.org";
    if (/first name/.test(q.question)) return "DNS Manager";
    throw new Error(`unexpected question: ${q.question}`);
  };
  return Object.assign(fn, { asked });
}

async function run(fake: FakeGoogle, state: State, opt: Partial<Options> = {}, answers: Answers = {}) {
  const lines: string[] = [];
  const prompt = prompter(fake, answers);
  let saved: State | null = null;
  const r = await goLive({
    opt: { ...DEFAULTS, project: P, domain: D, sheet: "https://docs.google.com/spreadsheets/d/SHEET1/edit", ...opt },
    g: fake,
    prompt,
    log: (l) => lines.push(l),
    state,
    save: async (s) => void (saved = structuredClone(s)),
    repoRoot: REPO,
  });
  return { ...r, lines, out: lines.join("\n"), asked: prompt.asked, saved: () => saved };
}

const startState = (fake: FakeGoogle): State => ({ version: 1, webClientId: fake.webClientId });
const changesPlanned = (r: { results: { changes: number }[] }) => r.results.reduce((n, x) => n + x.changes, 0);

test("show-only lists every change and changes nothing", async () => {
  const fake = setup();
  const r = await run(fake, startState(fake));
  assert.equal(r.stopped, undefined, r.out);
  assert.deepEqual(fake.mutations, []);
  assert.equal(r.results.length, 14);
  assert.ok(changesPlanned(r) > 80, String(changesPlanned(r)));
  assert.match(r.out, /Step 0 of 13: Check this computer and sign in/);
  assert.match(r.out, /Step 13 of 13: Go live \(beta\)/);
  assert.match(r.out, /Create portal-team-youth@x.org "Youth"/);
  assert.match(r.out, /Link IAR's billing account .*\[costs money\]/);
  assert.match(r.out, /Open the beta: add the 2 testers .*\[may email people\]/);
  assert.match(r.out, /Nothing was changed/);
  assert.ok(!r.asked.some((q) => q.kind === "yesno"), "show-only asks nothing");
  assert.equal(r.saved(), null, "show-only saves no state");
});

test("on a new project, show-only stops after step 0 and says why", async () => {
  const fake = setup({ ready: false });
  const r = await run(fake, { version: 1 });
  assert.deepEqual(fake.mutations, []);
  assert.match(r.out, /Create the Cloud project iar-test/);
  assert.match(r.out, /two sign-in clients/);
  assert.match(r.stopped?.message ?? "", /Run with --apply to do step 0/);
});

async function fullApply(fake: FakeGoogle, answers: Answers = {}) {
  const state: State = { version: 1 };
  const r = await run(fake, state, { apply: true }, answers);
  return { r, state };
}

test("apply from nothing creates everything, then a second run plans no changes", async () => {
  const fake = setup({ ready: false });
  const builder = `${fake.projectNumber}-compute@developer.gserviceaccount.com`;
  fake.serviceAccounts.set(builder, { email: builder, uniqueId: "1" });
  const { r, state } = await fullApply(fake);
  assert.ok(fake.projectBindingSet.has(`serviceAccount:${builder}|roles/run.builder`), "Cloud Build can build the portal");
  assert.equal(r.stopped, undefined, r.out);

  // Cloud
  assert.ok(fake.projects.has(P));
  assert.equal(fake.billing.get(P), fake.billingAccounts[0].id);
  assert.ok(fake.services.has("run.googleapis.com") && fake.services.has("billingbudgets.googleapis.com"));
  assert.equal(fake.db?.pitr, true);
  assert.equal(fake.indexes.length, 3);
  assert.deepEqual([...fake.secrets.keys()].sort(), ["google-client-secret", "nextauth-secret"]);
  assert.equal(fake.secrets.get("google-client-secret"), "web-client-secret");
  const run_ = `portal-runtime@${P}.iam.gserviceaccount.com`;
  assert.ok(fake.saBindings.get(run_)?.has(`serviceAccount:${run_}|roles/iam.serviceAccountTokenCreator`));
  assert.ok(!fake.saBindings.get(run_)?.has(`user:admin@x.org|roles/iam.serviceAccountTokenCreator`), "the admin's test grant is removed");
  assert.equal(state.delegationVerified?.split("|")[1].split(",").length, 4);

  // Workspace
  assert.ok(fake.users.get("portal@x.org")?.license);
  assert.ok(fake.users.has("portal-directory@x.org"));
  assert.deepEqual(fake.roleHolders.get(fake.roles[0].id), ["portal-directory@x.org"]);
  assert.equal(fake.groups.size, 26 + 1 + 5);
  assert.equal(fake.groupSettings.get("portal-team-youth@x.org")?.whoCanModerateMembers, "OWNERS_ONLY");
  assert.equal(fake.groupSettings.get("portal-role-finance@x.org")?.whoCanPostMessage, "ALL_IN_DOMAIN_CAN_POST");
  assert.deepEqual(fake.members.get("portal-team-youth@x.org")?.map((m) => `${m.email}:${m.role}`), ["chair@x.org:OWNER", "vice@x.org:MANAGER", "member@x.org:MEMBER"]);
  assert.deepEqual(fake.members.get("portal-pillar-community@x.org")?.map((m) => `${m.email}:${m.role}:${m.type}`), [
    "dir@x.org:OWNER:USER", "portal-team-youth@x.org:MEMBER:GROUP", "portal-team-women@x.org:MEMBER:GROUP",
  ]);
  assert.equal(fake.spaces.size, SPACES.length);
  for (const s of fake.spaces.values()) assert.deepEqual(s.members.map((m) => m.type).sort(), ["BOT", "GROUP", "HUMAN"]);
  assert.equal(fake.drives.size, 3);
  const w9 = [...fake.drives.values()].find((d) => d.name === "W-9s")!;
  assert.deepEqual(w9.perms.map((p) => `${p.email}:${p.role}`).sort(), [`portal-role-finance@x.org:organizer`, `${run_}:writer`]);
  assert.ok(fake.acl.get("c_hall@resource.calendar.google.com")?.some((a) => a.email === "portal@x.org" && a.role === "writer"));
  assert.ok(fake.acl.get("events@group.calendar.google.com")?.some((a) => a.email === "portal@x.org"));
  assert.ok(!fake.acl.has("c_store@resource.calendar.google.com"), "rooms not on the Sheet are left alone");
  assert.match(r.out, /Warning: "Room 240 – conference room" has no recurring hold/);

  // Deploy
  const env = fake.service!.env;
  assert.equal(env.NEXTAUTH_URL, `https://iar-portal-${fake.projectNumber}.us-east1.run.app`);
  assert.equal(env.PORTAL_ACCESS_GROUP, "portal-role-beta@x.org");
  assert.equal(env.DAILY_INVOKER, `portal-scheduler@${P}.iam.gserviceaccount.com`);
  assert.equal(env.PO_DRIVE_FOLDER_ID, state.drives!.po.folderId);
  assert.equal(env.PORTAL_CHAT, "on");
  assert.equal(env.GOOGLE_CLIENT_ID, fake.webClientId);
  assert.equal(env.PO_EXECUTIVE_THRESHOLD, undefined);
  assert.equal(fake.drafts.length, 1);
  assert.equal(fake.drafts[0].to, "dns@elsewhere.org");
  assert.match(fake.drafts[0].text, /^Assalamu alaikum DNS Manager,/);
  assert.match(fake.drafts[0].text, /CNAME\s+portal\s+ghs\.googlehosted\.com\./);

  // Settings
  const doc = fake.docs.get(SETTINGS_DOC)!;
  assert.equal((doc.teamFunds as Record<string, string>)["portal-team-youth@x.org"], "Youth Expenses");
  assert.deepEqual((doc.cards as { last4: string }[]).map((c) => c.last4), ["2093"]);
  assert.equal((doc.chatSpaces as Record<string, string>).av, (doc.chatSpaces as Record<string, string>).it);
  assert.match(fake.sheets.get("SHEET1")!.title, /\(archived — Google Groups is the record now\)$/);

  // Running costs and safety
  assert.equal(fake.jobs.get("portal-daily")?.audience, `${env.NEXTAUTH_URL}/api/daily`);
  assert.ok(fake.jobs.has("portal-backup"));
  assert.equal(fake.buckets.get(`${P}-firestore-backups`)?.deleteAfterDays, 30);
  assert.equal(fake.uptime.length, 1);
  assert.equal(fake.alerts[0].channelEmails[0], "portal-role-admin@x.org");
  assert.deepEqual(fake.logMetrics.map((m) => m.name), ["iar_portal_server_errors", "iar_portal_health"]);
  assert.match(fake.logMetrics[0].filter, /service_name="iar-portal" AND httpRequest\.status>=500/);
  assert.match(fake.logMetrics[1].filter, /jsonPayload\.portalHealth:\*/);
  for (const name of ["IAR Portal server errors", "IAR Portal can't reach Google"])
    assert.deepEqual(fake.alerts.find((a) => a.displayName === name)?.channelEmails, ["portal-role-admin@x.org"], name);
  assert.equal(fake.budgets[0].amountUsd, 25);
  assert.equal(fake.cleanupKeep, 10);

  // Check
  assert.match(r.out, /\/signin answers \(200\)/);
  assert.match(r.out, /\[ \] Someone not in portal-role-beta@ signs in/);

  // Beta
  assert.deepEqual(fake.members.get("portal-role-beta@x.org")?.map((m) => m.email), ["tester1@x.org", "tester2@x.org"]);

  // Again: nothing to do (the custom domain is still waiting for DNS, which is a check, not a change).
  const before = fake.mutations.length;
  const again = await run(fake, structuredClone(state), { apply: true });
  assert.equal(again.stopped, undefined, again.out);
  assert.equal(changesPlanned(again), 0, again.out);
  assert.deepEqual(fake.mutations.slice(before), []);
  assert.match(again.out, /Waiting for portal\.x\.org/);
  assert.ok(!again.asked.some((q) => q.kind === "yesno"));
});

test("an unknown address in the Sheet stops before any change, listing every problem", async () => {
  const sheet = filledSheet({ groups: [["Youth", "", "nobody@x.org", "Member", ""]], testers: [["ghost@x.org", "", ""]] });
  const fake = setup({ sheet });
  const r = await run(fake, startState(fake), { apply: true });
  assert.ok(r.stopped);
  assert.match(r.stopped!.message, /2 addresses in the members Sheet can't be used/);
  assert.match(r.stopped!.lines.join("\n"), /nobody@x.org \(Groups tab \(Youth\)\) isn't an account/);
  assert.match(r.stopped!.lines.join("\n"), /ghost@x.org \(Testers tab\)/);
  assert.deepEqual(fake.mutations, []);
});

test("a Sheet with mistakes stops with all of them", async () => {
  const sheet = filledSheet({ groups: [["Yuoth", "", "member@x.org", "Member", ""], ["Youth", "", "someone@gmail.com", "Member", ""]] });
  const fake = setup({ sheet });
  const r = await run(fake, startState(fake), { apply: true });
  assert.match(r.stopped!.message, /has 2 problems/);
  assert.deepEqual(fake.mutations, []);
});

test("--sync lists extra members and removes them only after their own yes", async () => {
  const fake = setup();
  let state = startState(fake);
  const first = await run(fake, state, { apply: true, only: "groups" });
  assert.equal(first.stopped, undefined, first.out);
  fake.members.get("portal-team-youth@x.org")!.push({ email: "office@x.org", role: "MEMBER", type: "USER" });

  const plain = await run(fake, structuredClone(state), {});
  assert.doesNotMatch(plain.out, /Remove office@x.org/, "without --sync, extras aren't touched");

  const declined = await run(fake, structuredClone(state), { apply: true, only: "groups", sync: true }, { no: [/removes something/] });
  assert.match(declined.out, /- remove\s+Remove office@x.org from portal-team-youth@x.org \(not on the Sheet\)\s+\[removes something\]/);
  assert.ok(fake.members.get("portal-team-youth@x.org")!.some((m) => m.email === "office@x.org"));
  assert.ok(!fake.mutations.includes("removeMember"));

  state = structuredClone(state);
  await run(fake, state, { apply: true, only: "groups", sync: true });
  assert.ok(!fake.members.get("portal-team-youth@x.org")!.some((m) => m.email === "office@x.org"));
  assert.ok(fake.members.get("portal-role-beta@x.org")!.length === 0, "--sync never touches the beta group");
});

test("no stage ever creates or downloads a service account key", async () => {
  const fake = setup({ ready: false });
  await fullApply(fake);
  assert.ok(fake.calls.length > 100);
  assert.deepEqual(fake.calls.filter((c) => /key/i.test(c)), []);
  const real = readFileSync(join(PKG, "src", "google-real.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(real, /keys\b.*create|create.*\bkeys\b|serviceAccountKey|\.keys\./i);
  const iface = readFileSync(join(PKG, "src", "google.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(iface, /key/i);
});

test("testers are added only in the last step, and only after their own yes", async () => {
  const fake = setup();
  const r = await run(fake, startState(fake), { apply: true }, { no: [/may email people/] });
  assert.equal(r.stopped, undefined, r.out);
  assert.deepEqual(fake.members.get("portal-role-beta@x.org"), []);
  const emailAsk = r.asked.filter((q) => /may email people/.test(q.question));
  assert.equal(emailAsk.length, 1);
  assert.match(emailAsk[0].question, /Open the beta/);
  const later = await run(fake, structuredClone(r.ctx.state), { apply: true, only: "beta" });
  assert.equal(later.stopped, undefined, later.out);
  assert.deepEqual(fake.members.get("portal-role-beta@x.org")?.map((m) => m.email), ["tester1@x.org", "tester2@x.org"]);
});

test("Gmail is only ever a draft", async () => {
  const fake = setup({ ready: false });
  await fullApply(fake);
  assert.equal(fake.calls.filter((c) => c === "createDraft").length, 1);
  assert.deepEqual(fake.calls.filter((c) => /send/i.test(c)), []);
  const real = readFileSync(join(PKG, "src", "google-real.ts"), "utf8");
  assert.match(real, /drafts\.create/);
  assert.doesNotMatch(real, /messages\.send|drafts\.send/);
});

test("settings merge keeps what's already in Portal Settings", async () => {
  const fake = setup();
  const first = await run(fake, startState(fake), { apply: true, only: "cloud" });
  assert.equal(first.stopped, undefined, first.out);
  fake.docs.set(SETTINGS_DOC, {
    teamFunds: { "portal-team-youth@x.org": "General Fund Expenses" },
    cards: [{ last4: "1111", holderEmail: "a@x.org", holderName: "A", fund: "General Fund Expenses" }],
    chatSpaces: { finance: "spaces/OLD" },
    updatedBy: "someone",
    somethingElse: { keep: true },
  });
  const state = { ...first.ctx.state, chatSpaces: { finance: "spaces/NEW", it: "spaces/IT" } };
  const r = await run(fake, state, { apply: true, only: "settings" });
  assert.equal(r.stopped, undefined, r.out);
  const doc = fake.docs.get(SETTINGS_DOC)!;
  assert.deepEqual(doc.somethingElse, { keep: true });
  const funds = doc.teamFunds as Record<string, string>;
  assert.equal(funds["portal-team-youth@x.org"], "General Fund Expenses", "an admin's choice wins over the Sheet");
  assert.equal(funds["portal-team-cleaning@x.org"], "Cleaning Committee Expenses");
  assert.deepEqual((doc.cards as { last4: string }[]).map((c) => c.last4), ["1111", "2093"]);
  assert.deepEqual(doc.chatSpaces, { finance: "spaces/OLD", it: "spaces/IT", av: "spaces/IT" });
  assert.match(r.out, /portal-team-youth@x.org: kept "General Fund Expenses"/);
});

test("mergeSettings: only fills gaps, and writes nothing when there are none", () => {
  const m = mergeSettings({ teamFunds: { a: "F1" }, cards: [], chatSpaces: { office: "spaces/1" } }, { teamFunds: { a: "F2" }, cards: [], chatSpaces: { office: "spaces/2" } });
  assert.deepEqual(m.fields, {});
  assert.equal(m.kept.length, 1);
  assert.deepEqual(spacesByRole({ it: "spaces/X", admins: "spaces/A" }), { it: "spaces/X", av: "spaces/X", admins: "spaces/A" });
});

test("once DNS works, a later run switches the portal to portal.<domain> and moves the daily job with it", async () => {
  const fake = setup({ ready: false });
  const { state } = await fullApply(fake);
  fake.dnsDone = true;
  fake.redirectsAccepted = false;
  const r = await run(fake, structuredClone(state), { apply: true });
  assert.equal(r.stopped, undefined, r.out);
  assert.equal(fake.service!.env.NEXTAUTH_URL, "https://portal.x.org");
  assert.ok(r.asked.some((q) => q.step === "redirect-uri"), "asks for the new redirect URI first");
  assert.equal(fake.jobs.get("portal-daily")?.uri, "https://portal.x.org/api/daily");
  assert.equal(fake.jobs.get("portal-daily")?.audience, "https://portal.x.org/api/daily");
  assert.equal(fake.uptime.at(-1)?.host, "portal.x.org");
  assert.equal(fake.drafts.length, 1, "the DNS draft isn't written again");
});

test("--production opens the portal to everyone after its own yes, and later runs keep it open", async () => {
  const fake = setup({ ready: false });
  const { state } = await fullApply(fake);
  const declined = await run(fake, structuredClone(state), { apply: true, production: true }, { no: [/widens access/] });
  assert.equal(fake.service!.env.PORTAL_ACCESS_GROUP, "portal-role-beta@x.org");
  const r = await run(fake, structuredClone(declined.ctx.state), { apply: true, production: true });
  assert.equal(r.stopped, undefined, r.out);
  assert.equal(fake.service!.env.PORTAL_ACCESS_GROUP, undefined);
  const after = await run(fake, structuredClone(r.ctx.state), { apply: true });
  assert.equal(changesPlanned(after), 0, after.out);
  assert.equal(fake.service!.env.PORTAL_ACCESS_GROUP, undefined);
});

test("no free license: go-live says how to get one, carries on, and asks again next time", async () => {
  const fake = setup({ freeLicenses: 0 });
  const r = await run(fake, startState(fake), { apply: true, only: "accounts" });
  assert.equal(r.stopped, undefined, r.out);
  assert.match(r.out, /There's no free Google Workspace for Nonprofits license/);
  assert.ok(fake.users.has("portal@x.org") && !fake.users.get("portal@x.org")!.license);
  const again = await run(fake, structuredClone(r.ctx.state), { only: "accounts" });
  assert.match(again.out, /Give portal@x.org a Google Workspace license/);
});

test("saying no to a stage stops the run there and changes nothing in it", async () => {
  const fake = setup();
  const r = await run(fake, startState(fake), { apply: true }, { no: [/^Apply these \d+ changes\?/] });
  assert.match(r.stopped!.message, /Stopped before "Google Cloud/);
  assert.deepEqual(fake.mutations, []);
});

test("--template makes the blank Sheet and stops", async () => {
  const fake = setup();
  const state = startState(fake);
  const r = await run(fake, state, { apply: true, template: true, sheet: undefined });
  assert.match(r.stopped!.message, /blank Sheet is made/);
  assert.ok(state.sheetId && fake.sheets.get(state.sheetId)!.tabs[TAB.groups].length === 1 + LAUNCH_TEAMS.length + 4);
  assert.match(r.out, /The Sheet is ready: https:\/\/docs.google.com\/spreadsheets\/d\//);
  assert.deepEqual(fake.mutations, ["createSpreadsheet"]);
});

test("reader role privileges: matched by pattern, with what's missing named", () => {
  const all = [{ serviceId: "s", privilegeName: "GROUPS_RETRIEVE" }, { serviceId: "s", privilegeName: "CALENDAR_RESOURCE_READ" }];
  const r = readerPrivileges(all);
  assert.deepEqual(r.picked.map((p) => p.privilegeName), ["GROUPS_RETRIEVE", "CALENDAR_RESOURCE_READ"]);
  assert.deepEqual(r.missing, ["Buildings → Read"]);
});

test("rooms: names match despite dash styles; missing, extra and undecided are reported", () => {
  const m = matchRooms(
    [{ name: "Room 240 – conference room", bookable: true }, { name: "Gym", bookable: true }, { name: "Fire Pit Area", bookable: null }],
    [{ name: "Room 240 - Conference Room", email: "a" }, { name: "Storage", email: "b" }],
  );
  assert.deepEqual(m.matched.map((x) => x.resource.email), ["a"]);
  assert.deepEqual(m.missing, ["Gym"]);
  assert.deepEqual(m.extra, ["Storage"]);
  assert.deepEqual(m.undecided, ["Fire Pit Area"]);
});

test("Firestore values: Portal Settings round-trips through the REST format", () => {
  const doc = { teamFunds: { "portal-team-youth@x.org": "Youth Expenses" }, cards: [{ last4: "2093", holderName: "A" }], n: 3, x: 1.5, ok: true, none: null };
  const enc = toFields(doc);
  assert.deepEqual(enc.cards, { arrayValue: { values: [{ mapValue: { fields: { last4: { stringValue: "2093" }, holderName: { stringValue: "A" } } } }] } });
  assert.deepEqual(fromFields(enc), doc);
  assert.equal(fieldPath("teamFunds"), "teamFunds");
  assert.equal(fieldPath("a-b"), "`a-b`");
});

test("command line: show-only by default; flags and their values", () => {
  assert.deepEqual(parseArgs([]), DEFAULTS);
  const o = parseArgs(["--apply", "--only", "groups", "--sync", "--sheet=https://docs.google.com/spreadsheets/d/abc/edit", "--project", "iar-p", "--domain", "Islam1.org"]);
  assert.equal(o.apply, true);
  assert.equal(o.only, "groups");
  assert.equal(o.sync, true);
  assert.equal(o.project, "iar-p");
  assert.equal(o.domain, "islam1.org");
  assert.equal(sheetIdOf(o.sheet!), "abc");
  assert.throws(() => parseArgs(["--only", "everything"]), /--only takes one of/);
  assert.throws(() => parseArgs(["--aply"]), /Unknown option --aply/);
  assert.throws(() => parseArgs(["--project"]), /--project needs a value/);
});

test("the DNS email has the plan's wording and the exact records", () => {
  const e = dnsEmail({ host: "portal.islam1.org", domain: "islam1.org", records: [{ type: "CNAME", name: "portal", value: "ghs.googlehosted.com.", ttl: "3600" }], managerName: "DNS Manager", adminName: "Portal Admin" });
  assert.equal(e.subject, "DNS records for portal.islam1.org (new IAR Portal)");
  assert.match(e.text, /Could you add the following to the islam1.org DNS zone\?/);
  assert.match(e.text, /Type\s+Name\s+Value\s+TTL\n\s+CNAME\s+portal\s+ghs\.googlehosted\.com\.\s+3600/);
  assert.match(e.text, /pki\.goog and letsencrypt\.org/);
  assert.match(e.text, /JazakAllahu khairan\.\n\nPortal Admin$/);
  assert.match(e.html, /<td[^>]*>ghs\.googlehosted\.com\.<\/td>/);
});
