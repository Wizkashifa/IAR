/**
 * Admins signing in as someone. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readActAs, signActAs, tagOnBehalf } from "./act-as";
import type { Card } from "./cards";

const secret = "test-secret";
const now = Date.parse("2026-10-26T15:00:00Z");
const a = { admin: "ada@islam1.org", adminName: "Ada Admin", target: "val@islam1.org", targetName: "Val Volunteer", exp: now + 60_000 };

test("act as: the cookie reads back only for the admin who signed it, unaltered and in time", () => {
  const t = signActAs(a, secret);
  assert.deepEqual(readActAs(t, secret, "Ada@islam1.org", now), a);
  assert.equal(readActAs(t, secret, "someone@islam1.org", now), null, "another admin");
  assert.equal(readActAs(t, "other-secret", a.admin, now), null, "other secret");
  assert.equal(readActAs(t, secret, a.admin, a.exp), null, "expired");
  const [body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ ...a, target: "ceo@islam1.org" })).toString("base64url");
  assert.equal(readActAs(`${forged}.${sig}`, secret, a.admin, now), null, "altered");
  assert.equal(readActAs(body, secret, a.admin, now), null, "no signature");
  assert.equal(readActAs(undefined, secret, a.admin, now), null);
});

const card = (o: Partial<Card>): Card => ({ id: "PO-12001", orgId: "iar", type: "purchase", title: "Snacks", status: "submitted", ownerEmail: a.target, committee: "Youth", updatedAt: "2026-10-26T14:00:00Z", ...o });
const h = (action: string, note?: string) => ({ at: "2026-10-26T14:00:00Z", by: a.target, action, ...(note ? { note } : {}) });

test("act as: only what was added while signed in is marked as the admin's", () => {
  const before = card({ purchase: { history: [h("Submitted")] } as never, comments: [{ id: "c1", at: "x", by: a.target, name: "Val Volunteer", text: "hi" }] });
  const after = card({
    purchase: { history: [h("Submitted"), h("Changed the amount", "Wrong total")] } as never,
    comments: [...before.comments!, { id: "c2", at: "y", by: a.target, name: "Val Volunteer", text: "fixed" }],
  });
  const out = tagOnBehalf(before, after, a);
  const hist = (out.purchase as unknown as { history: { note?: string }[] }).history;
  assert.equal(hist[0]!.note, undefined);
  assert.equal(hist[1]!.note, "Wrong total\nDone by Ada Admin (portal admin) while signed in as this person.");
  assert.equal(out.comments![0]!.name, "Val Volunteer");
  assert.equal(out.comments![1]!.name, "Val Volunteer (by Ada Admin, signed in as them)");
  // Saving again doesn't mark it twice.
  assert.deepEqual(tagOnBehalf(before, out, a), out);
});

test("act as: a new request is marked from its first line", () => {
  const out = tagOnBehalf(null, card({ purchase: { history: [h("Submitted")] } as never }), a);
  assert.match((out.purchase as unknown as { history: { note?: string }[] }).history[0]!.note!, /Done by Ada Admin/);
});
