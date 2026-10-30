/**
 * Committees and teams from Google Groups, and Portal Settings checks. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNDS } from "./purchases/accounts";
import { directRolesFromGroups, ORG, roleMailbox } from "./org";
import { checkCard, checkTeamFund } from "./settings-rules";
import {
  type Directory,
  type DirectoryGroup,
  approversForFund,
  directedTeamGroups,
  effectiveTeamFunds,
  fundsFor,
  portalPeopleFrom,
  membershipsOf,
  requestableFunds,
  suggestFund,
  TEAM_SLUGS,
  teamGroupEmail,
  teamSlug,
  teamPeople,
  teamRoles,
  groupDisplayName,
} from "./teams";

const NAMES = [
  "Administration", "Al-Furqan School", "Al-Iman School", "An-Noor School", "Cemetery", "Cleaning", "Construction", "Da'wah", "Education",
  "Events Committee", "Facility Maintenance", "Fundraising", "Health & Wellness", "IAR Cafe", "Imam Office", "IT Services", "Marketing",
  "Older Adult Community", "Page Road", "Safety & Security", "Shura", "Social & Welfare", "Sports & Recreation", "Volunteer",
  "Women's Committee", "Youth",
];

test("slugs: every launch team has the group address IAR chose; a new team's is worked out from its name", () => {
  assert.deepEqual(NAMES.map(teamSlug), [
    "administration", "al-furqan-school", "al-iman-school", "an-noor-school", "cemetery", "cleaning", "construction", "dawah", "education",
    "events", "maintenance", "fundraising", "hw", "cafe", "imams", "tech", "marketing",
    "seniors", "page", "security", "shura", "welfare", "sports", "volunteer",
    "women", "youth",
  ]);
  assert.deepEqual(Object.keys(TEAM_SLUGS).sort(), [...NAMES].sort(), "the slug list and the launch list match");
  assert.equal(teamGroupEmail("IT Services", "x.org"), "portal-team-tech@x.org");
  assert.equal(teamGroupEmail("Girls' Scouts Committee", "x.org"), "portal-team-girls-scouts@x.org");
  assert.equal(new Set(NAMES.map(teamSlug)).size, NAMES.length);
});

test("funds: suggested only when the name clearly matches; the rest wait for an admin", () => {
  const got = Object.fromEntries(NAMES.map((n) => [n, suggestFund(n, FUNDS) ?? null]));
  assert.equal(got["Youth"], "Youth Expenses");
  assert.equal(got["Women's Committee"], "Women Expenses");
  assert.equal(got["Events Committee"], "Event Committee Expenses");
  assert.equal(got["Imam Office"], "Imam's Office Fund Expenses");
  assert.equal(got["Health & Wellness"], "Health and Wellness Expenses");
  assert.equal(got["Page Road"], "Page Rd");
  assert.equal(got["Al-Furqan School"], "Al-Furqan School Expenses");
  assert.equal(got["Social & Welfare"], "Social & Welfare");
  for (const n of ["Administration", "Older Adult Community", "Fundraising", "Marketing", "IT Services", "Shura", "Volunteer"]) assert.equal(got[n], null, n);
});

// A small org: Youth (chair + vice + members), Education (co-chairs), S&W, Marketing,
// and a Programs pillar directed by two people over Youth and Women.
const team = (name: string, members: [string, "OWNER" | "MANAGER" | "MEMBER"][]): DirectoryGroup => ({
  email: teamGroupEmail(name, "x.org"),
  name,
  members: members.map(([email, role]) => ({ email, role, type: "USER" as const })),
});
const dir: Directory = {
  teams: [
    team("Youth", [["chair@x.org", "OWNER"], ["vice@x.org", "MANAGER"], ["vol@x.org", "MEMBER"]]),
    team("Education", [["chair@x.org", "MEMBER"], ["edu1@x.org", "OWNER"], ["edu2@x.org", "OWNER"]]),
    team("Women's Committee", [["women@x.org", "OWNER"]]),
    team("Social & Welfare", [["sw@x.org", "OWNER"]]),
    team("Marketing", [["mk@x.org", "MEMBER"]]),
    team("Fundraising", []),
  ],
  pillars: [
    {
      email: "portal-pillar-programs@x.org",
      name: "Programs",
      members: [
        { email: "dir@x.org", role: "OWNER", type: "USER" },
        { email: "dir2@x.org", role: "OWNER", type: "USER" },
        { email: "portal-team-youth@x.org", role: "MEMBER", type: "GROUP" },
        { email: "portal-team-women@x.org", role: "MEMBER", type: "GROUP" },
      ],
    },
  ],
};
const funds = effectiveTeamFunds(dir, { "portal-team-fundraising@x.org": "General Fund Expenses" }, FUNDS);

test("teams: a person's role is per team; chairing one never makes them chair of another", () => {
  assert.deepEqual(membershipsOf(dir, "CHAIR@x.org"), [
    { name: "Education", group: "portal-team-education@x.org", role: "member" },
    { name: "Youth", group: "portal-team-youth@x.org", role: "chair" },
  ]);
  const f = fundsFor(dir, funds, "chair@x.org");
  assert.deepEqual(f.request, ["Education Expenses", "Youth Expenses"]);
  assert.deepEqual(f.chairs, ["Youth Expenses"]);
  assert.deepEqual(f.oversees, ["Youth Expenses"]);
  // Education's approvers don't include someone who is only a member there.
  assert.deepEqual(approversForFund(dir, funds, "Education Expenses").chairs, ["edu1@x.org", "edu2@x.org"]);
});

test("teams: chairs, vice chairs and directors of a fund", () => {
  assert.deepEqual(approversForFund(dir, funds, "Youth Expenses"), { chairs: ["chair@x.org"], backups: ["vice@x.org"], directors: ["dir2@x.org", "dir@x.org"] });
  assert.deepEqual(approversForFund(dir, funds, "Women Expenses").directors, ["dir2@x.org", "dir@x.org"]);
  // A fund no team charges has nobody: requests go to finance review.
  assert.deepEqual(approversForFund(dir, funds, "Cemetery Expenses"), { chairs: [], backups: [], directors: [] });
  assert.deepEqual(teamPeople(dir, "portal-team-youth@x.org").memberCount, 3);
});

test("directors: everything comes from the pillar group: co-directors, its teams, and what they may request", () => {
  assert.deepEqual(directedTeamGroups(dir, "dir@x.org"), ["portal-team-women@x.org", "portal-team-youth@x.org"]);
  assert.deepEqual(directedTeamGroups(dir, "dir2@x.org"), directedTeamGroups(dir, "dir@x.org"));
  const f = fundsFor(dir, funds, "dir@x.org");
  assert.deepEqual(f.directs, ["Women Expenses", "Youth Expenses"]);
  assert.deepEqual(f.request, ["Women Expenses", "Youth Expenses"]);
  assert.deepEqual(f.oversees, ["Women Expenses", "Youth Expenses"]);
  assert.deepEqual(f.chairs, []);
  // Members of a pillar group that aren't teams, and non-owners, don't direct anything.
  assert.deepEqual(directedTeamGroups(dir, "vol@x.org"), []);
});

test("funds: a saved choice wins over the suggestion; a team with neither has no fund", () => {
  assert.equal(funds["portal-team-fundraising@x.org"], "General Fund Expenses");
  assert.equal(funds["portal-team-youth@x.org"], "Youth Expenses");
  assert.equal(funds["portal-team-marketing@x.org"], undefined);
  const saved = effectiveTeamFunds(dir, { "portal-team-youth@x.org": "Education Expenses" }, FUNDS);
  assert.equal(saved["portal-team-youth@x.org"], "Education Expenses");
});

test("requests: members charge their teams' funds; office and finance any; nobody else", () => {
  assert.deepEqual(requestableFunds(fundsFor(dir, funds, "vol@x.org").request, ["member"], FUNDS), ["Youth Expenses"]);
  assert.deepEqual(requestableFunds([], ["member", "office"], FUNDS), FUNDS);
  assert.deepEqual(requestableFunds([], ["member", "finance"], FUNDS), FUNDS);
  assert.deepEqual(requestableFunds(fundsFor(dir, funds, "nobody@x.org").request, ["member"], FUNDS), []);
});

test("roles: team queues come from being on the team, at any level; chairs from owning any team", () => {
  assert.deepEqual(teamRoles(membershipsOf(dir, "mk@x.org")), ["marketing"]);
  assert.deepEqual(teamRoles(membershipsOf(dir, "sw@x.org")).sort(), ["chairs", "sw"]);
  assert.deepEqual(teamRoles(membershipsOf(dir, "vol@x.org")), []);
  const it = teamRoles([{ name: "IT Services", group: "portal-team-tech@x.org", role: "member" }]);
  assert.deepEqual(it.sort(), ["av", "it"]);
  assert.deepEqual(teamRoles([{ name: "Safety & Security", group: "portal-team-security@x.org", role: "member" }]), [], "Safety & Security is a committee, not a queue");
  assert.deepEqual(teamRoles([{ name: "Safety & Security", group: "portal-team-security@x.org", role: "chair" }]), ["chairs"]);
  assert.equal(teamSlug("Safety & Security"), "security", "its group address stays portal-team-security@");
});

test("roles: role groups plus team roles, with queue email going to the team's group", () => {
  const d = ORG.domain;
  assert.deepEqual(directRolesFromGroups([`portal-role-finance@${d}`, `portal-role-executive@${d}`], ["marketing"]), ["member", "finance", "marketing", "executive"]);
  assert.deepEqual(directRolesFromGroups([`portal-finance@${d}`]), ["member"]);
  assert.equal(roleMailbox("finance"), `portal-role-finance@${d}`);
  assert.equal(roleMailbox("marketing"), `portal-team-marketing@${d}`);
  assert.equal(roleMailbox("av"), `portal-team-tech@${d}`);
  assert.equal(roleMailbox("facilities"), `portal-team-maintenance@${d}`);
  assert.equal(roleMailbox("sw"), `portal-team-welfare@${d}`);
  assert.equal(roleMailbox("chairs"), null);
});

test("settings: cards keep only the last four digits and a domain holder, no fund; team funds must be real", () => {
  const ctx = { domain: "x.org", existing: [{ last4: "1111", holderEmail: "a@x.org", holderName: "A" }] };
  const ok = checkCard({ last4: "2093", holderEmail: " H@x.org ", holderName: "H" }, ctx);
  assert.deepEqual(ok, { ok: true, card: { last4: "2093", holderEmail: "h@x.org", holderName: "H" } });
  assert.equal(checkCard({ last4: "4111111111111111", holderEmail: "h@x.org", holderName: "H" }, ctx).ok, false);
  assert.equal(checkCard({ last4: "1111", holderEmail: "h@x.org", holderName: "H" }, ctx).ok, false);
  assert.equal(checkCard({ last4: "2093", holderEmail: "h@gmail.com", holderName: "H" }, ctx).ok, false);
  const t = { funds: FUNDS, teamGroups: ["portal-team-youth@x.org"] };
  assert.ok(checkTeamFund("portal-team-youth@x.org", "Youth Expenses", t).ok);
  assert.ok(checkTeamFund("portal-team-youth@x.org", "", t).ok);
  assert.equal(checkTeamFund("portal-team-gone@x.org", "Youth Expenses", t).ok, false);
  assert.equal(checkTeamFund("portal-team-youth@x.org", "Made Up", t).ok, false);
});

test("group names: a leading \"Portal:\" (used to find groups in the Admin console) isn't shown", () => {
  assert.equal(groupDisplayName("Portal: Youth"), "Youth");
  assert.equal(groupDisplayName("portal - Women's Committee"), "Women's Committee");
  assert.equal(groupDisplayName("Youth"), "Youth");
  assert.equal(groupDisplayName("Portal Road Crew"), "Portal Road Crew");
  assert.equal(groupDisplayName("Portal:"), "Portal:");
});

test("portal people: everyone in the portal's groups; with an access group only its members and admins", () => {
  const g = (email: string, members: string[], type: "USER" | "GROUP" = "USER"): DirectoryGroup => ({ email, name: email, members: members.map((m) => ({ email: m, role: "MEMBER" as const, type })) });
  const groups = [g("portal-team-youth@x.org", ["Chair@x.org", "member@x.org"]), g("portal-role-beta@x.org", ["chair@x.org", "tester@x.org"]), g("portal-role-admin@x.org", ["admin@x.org"]), g("portal-team-women@x.org", ["portal-role-beta@x.org"], "GROUP")];
  assert.deepEqual(portalPeopleFrom(groups), ["admin@x.org", "chair@x.org", "member@x.org", "tester@x.org"]);
  assert.deepEqual(portalPeopleFrom(groups, { group: "portal-role-beta@x.org", admins: "portal-role-admin@x.org" }), ["admin@x.org", "chair@x.org", "tester@x.org"]);
});
