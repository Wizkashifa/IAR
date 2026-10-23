/**
 * The members Sheet: the template and reading it back. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TAB, parseSheet, templateTabs } from "./sheet";
import { xlsx } from "./xlsx";

const D = "x.org";
const blank = () => Object.fromEntries(templateTabs(D).map((t) => [t.name, [t.header, ...t.rows]]));

test("template: every launch team and role group is listed, with no people", () => {
  const tabs = templateTabs(D);
  const groups = tabs.find((t) => t.name === TAB.groups)!;
  assert.equal(groups.rows.length, 27 + 4);
  assert.ok(groups.rows.some((r) => r[1] === "portal-team-women@x.org"));
  assert.ok(groups.rows.some((r) => r[1] === "portal-role-admin@x.org"));
  assert.ok(groups.rows.every((r) => r[2] === ""), "no emails in the template");
  const funds = tabs.find((t) => t.name === TAB.funds)!;
  assert.equal(funds.rows.find((r) => r[0] === "Youth")?.[1], "Youth Expenses");
  assert.ok(xlsx(tabs).subarray(0, 2).equals(Buffer.from("PK")));
});

test("parse: the blank template reads as an empty plan", () => {
  const r = parseSheet(blank(), D);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.plan.members.length, 0);
    assert.ok(Object.keys(r.plan.funds).length > 10);
    assert.equal(r.plan.rooms.length, 20);
  }
});

test("parse: members, pillars, cards and testers come back checked", () => {
  const t = blank();
  t[TAB.groups].push(["Youth", "", "Chair@x.org", "Owner", ""], ["Youth", "", "vice@x.org", "Manager", ""], ["Portal: Finance", "", "books@x.org", "", ""]);
  t[TAB.pillars] = [t[TAB.pillars][0], ["Community", "dir@x.org", "Youth, Women's Committee"]];
  t[TAB.cards] = [t[TAB.cards][0], ["2093", "Holder", "holder@x.org", "Youth Expenses"]];
  t[TAB.testers] = [t[TAB.testers][0], ["chair@x.org", "Chair", "chair"]];
  const r = parseSheet(t, D);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
  if (!r.ok) return;
  assert.deepEqual(r.plan.members.map((m) => [m.group, m.email, m.role]), [
    ["portal-team-youth@x.org", "chair@x.org", "OWNER"],
    ["portal-team-youth@x.org", "vice@x.org", "MANAGER"],
    ["portal-role-finance@x.org", "books@x.org", "MEMBER"],
  ]);
  assert.deepEqual(r.plan.pillars, [{ name: "Community", group: "portal-pillar-community@x.org", directors: ["dir@x.org"], teams: ["portal-team-youth@x.org", "portal-team-women@x.org"] }]);
  assert.deepEqual(r.plan.testers, ["chair@x.org"]);
  assert.equal(r.plan.cards[0].last4, "2093");
});

test("parse: every problem is listed with its tab and row", () => {
  const t = blank();
  t[TAB.groups].push(["Youth", "", "someone@gmail.com", "Owner", ""], ["Yuoth", "", "a@x.org", "Member", ""], ["Portal: Admins", "", "a@x.org", "Owner", ""]);
  t[TAB.cards] = [t[TAB.cards][0], ["4111111111111111", "Holder", "holder@x.org", "Youth Expenses"]];
  t[TAB.pillars] = [t[TAB.pillars][0], ["Community", "", "Youth"], ["Programs", "d2@x.org", "Youth"]];
  const r = parseSheet(t, D);
  assert.equal(r.ok, false);
  if (r.ok) return;
  const all = r.errors.join("\n");
  assert.match(all, /Groups, row \d+: "someone@gmail.com" isn't an @x.org address/);
  assert.match(all, /"Yuoth" isn't one of the committees/);
  assert.match(all, /Portal: Admins takes Members only/);
  assert.match(all, /Cards, row 2: enter only the card's last 4 digits/);
  assert.match(all, /Pillars, row 2: add the director's email/);
  assert.match(all, /under both Community and Programs/);
});
