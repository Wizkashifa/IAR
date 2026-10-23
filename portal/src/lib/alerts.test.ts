/**
 * Alerts through Google Chat, with email as the fallback. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { type Alert, alertEmail, chatMessage, fallbackFor, routeAlerts } from "./alerts";
import type { Role } from "./org";

const box = (r: Role) => (r === "finance" ? "portal-role-finance@x.org" : r === "it" || r === "av" ? "portal-team-tech@x.org" : null);
const spaces = { finance: "spaces/FIN", it: "spaces/IT", av: "spaces/IT" };
const a = (to: string, text = "PO-12001 needs your chair approval."): Alert => ({ to, text, href: "/purchases/PO-12001", cardId: "PO-12001" });

test("alerts: a person gets a Chat DM and a role gets a post in its space", () => {
  const d = routeAlerts([a("Chair@X.org"), a("role:finance")], { chat: true, spaces, groupMailbox: box });
  assert.deepEqual(d.map((x) => [x.via, x.via === "dm" ? x.email : x.via === "space" ? x.space : x.to]), [["dm", "chair@x.org"], ["space", "spaces/FIN"]]);
});

test("alerts: a role with no space goes to its group by email; no group means no alert", () => {
  const d = routeAlerts([a("role:finance"), a("role:security")], { chat: true, spaces: {}, groupMailbox: box });
  assert.deepEqual(d.map((x) => [x.via, x.via === "email" ? x.to : ""]), [["email", "portal-role-finance@x.org"]]);
});

test("alerts: with Chat off, everything goes by email as before", () => {
  const d = routeAlerts([a("chair@x.org"), a("role:finance")], { chat: false, spaces, groupMailbox: box });
  assert.deepEqual(d.map((x) => [x.via, x.via === "email" ? x.to : ""]), [["email", "chair@x.org"], ["email", "portal-role-finance@x.org"]]);
});

test("alerts: two roles sharing a space get one post", () => {
  const d = routeAlerts([a("role:it", "A/V task"), a("role:av", "A/V task")], { chat: true, spaces, groupMailbox: box });
  assert.equal(d.length, 1);
});

test("alerts: when Chat can't deliver, the person or the group gets the email instead", () => {
  const [dm, space] = routeAlerts([a("chair@x.org"), a("role:finance")], { chat: true, spaces, groupMailbox: box });
  assert.deepEqual(fallbackFor(dm, box), { via: "email", to: "chair@x.org", alert: dm.alert });
  assert.deepEqual(fallbackFor(space, box), { via: "email", to: "portal-role-finance@x.org", alert: space.alert });
});

test("alerts: the Chat card has the text, a button to the request, and the away note for someone covering", () => {
  const m = chatMessage({ ...a("backup@x.org", "Covering for Chair: PO-12001 <needs> approval"), cover: { name: "Chair", until: "2026-11-05" } }, "https://portal.x.org/purchases/PO-12001");
  const json = JSON.stringify(m);
  assert.match(json, /Open in the portal/);
  assert.match(json, /https:\/\/portal\.x\.org\/purchases\/PO-12001/);
  assert.match(json, /&lt;needs&gt;/);
  assert.match(json, /away until 2026-11-05/);
  assert.match(alertEmail(a("x@x.org"), "https://p/x").text, /Open it in the IAR Portal: https:\/\/p\/x/);
});
