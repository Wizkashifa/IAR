/** Who's who: teams by pillar, who sees members, where to ask, and search. Run with `npm test`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { devDirectory } from "./dev";
import { ORG } from "./org";
import { teamGroupEmail } from "./teams";
import { byPillar, checkTeamInfo, mayEditTeam, requestRoutes, searchTeams, searchTopics, seesMembers, teamEntries, queryWords } from "./whos-who";

const dir = devDirectory();
const info = { [teamGroupEmail("Social & Welfare", ORG.domain)]: { description: "Zakat applications and help for families in need.", chatUrl: "https://chat.google.com/room/AAAA" } };
const teams = teamEntries(dir, info);
const find = (slug: string) => teams.find((t) => t.slug === slug)!;

test("teams come from the directory with their leaders, pillar and saved description", () => {
  const youth = find("youth");
  assert.equal(youth.name, "Youth");
  assert.equal(youth.pillar, "Programs");
  assert.deepEqual(youth.chairs, ["chair@dev.local"]);
  assert.deepEqual(youth.vices, ["vice@dev.local"]);
  assert.deepEqual(youth.directors, ["director@dev.local"]);
  assert.ok(youth.memberCount >= 3);
  assert.equal(find("welfare").description, "Zakat applications and help for families in need.");
  assert.equal(find("welfare").chatUrl, "https://chat.google.com/room/AAAA");
});

test("grouped by pillar, then the teams no director oversees", () => {
  const groups = byPillar(teams);
  assert.equal(groups[0].name, "Programs");
  assert.ok(groups[0].teams.some((t) => t.slug === "youth"));
  assert.equal(groups[groups.length - 1].name, "Other committees and teams");
  assert.equal(groups.reduce((n, g) => n + g.teams.length, 0), teams.length);
});

test("members are shown to the team itself, the office and admins; leaders to everyone", () => {
  const group = find("youth").group;
  assert.ok(seesMembers({ email: "volunteer@dev.local", roles: ["member"], teams: [{ group }] }, group));
  assert.ok(seesMembers({ email: "office@dev.local", roles: ["member", "office"], teams: [] }, group));
  assert.ok(!seesMembers({ email: "marketing@dev.local", roles: ["member"], teams: [{ group: teamGroupEmail("Marketing", ORG.domain) }] }, group));
});

test("the chair, vice chair or an admin may change what a team handles", () => {
  const youth = find("youth");
  assert.ok(mayEditTeam({ email: "Chair@dev.local", actingRoles: [] }, youth));
  assert.ok(mayEditTeam({ email: "vice@dev.local", actingRoles: [] }, youth));
  assert.ok(mayEditTeam({ email: "admin@dev.local", actingRoles: ["admins"] }, youth));
  assert.ok(!mayEditTeam({ email: "volunteer@dev.local", actingRoles: [] }, youth));
});

test("requests go to the form the team works from", () => {
  assert.deepEqual(requestRoutes("marketing").map((r) => r.href), ["/marketing/new"]);
  assert.deepEqual(requestRoutes("maintenance").map((r) => r.href), ["/it-maintenance/new"]);
  assert.deepEqual(requestRoutes("tech").map((r) => r.href), ["/it-maintenance/new"]);
  assert.deepEqual(requestRoutes("youth").map((r) => r.href), ["/events/new", "/purchases/new"]);
});

test("search: keywords, names and descriptions, filler words ignored", () => {
  assert.deepEqual(queryWords("Who handles the sound system?"), ["sound", "system"]);
  assert.equal(searchTeams(teams, "Who handles the sound system?")[0].slug, "tech");
  assert.equal(searchTeams(teams, "keys")[0].slug, "administration");
  assert.equal(searchTeams(teams, "youth")[0].slug, "youth");
  assert.equal(searchTeams(teams, "zakat")[0].slug, "welfare");
  assert.equal(searchTeams(teams, "help for families")[0].slug, "welfare");
  assert.deepEqual(searchTeams(teams, "who handles"), []);
});

test("search: reimbursements point to a payment request rather than a team", () => {
  assert.equal(searchTopics("Who handles reimbursements?")[0].href, "/purchases/new");
  assert.deepEqual(searchTopics("who"), []);
});

test("a team's description and Chat link are checked before saving", () => {
  assert.deepEqual(checkTeamInfo({ description: "  Room keys  and   access ", chatUrl: "" }), { ok: true, info: { description: "Room keys and access" } });
  assert.equal(checkTeamInfo({ description: "x".repeat(301) }).ok, false);
  assert.equal(checkTeamInfo({ chatUrl: "https://example.com/room" }).ok, false);
  assert.equal(checkTeamInfo({ chatUrl: "https://mail.google.com/chat/u/0/#chat/space/AAAA" }).ok, true);
  assert.deepEqual(checkTeamInfo({}), { ok: true, info: {} });
});
