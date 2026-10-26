/**
 * Replies on portal feedback. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mayOpenFeedback, replyNotices } from "./feedback-thread";

const fb = { id: "FB-1", by: "Vol@islam1.org" };
const admin = { email: "admin@islam1.org", name: "Ada Admin", roles: ["member", "admins"] };
const sender = { email: "vol@islam1.org", name: "Val Volunteer", roles: ["member"] };
const other = { email: "other@islam1.org", name: "Oz Other", roles: ["member"] };

test("feedback: admins open any, the sender opens their own, nobody else", () => {
  assert.equal(mayOpenFeedback(fb, admin), true);
  assert.equal(mayOpenFeedback(fb, sender), true);
  assert.equal(mayOpenFeedback(fb, other), false);
});

test("feedback: an admin's reply reaches the sender in the portal and Chat; the sender's reply reaches the admins", () => {
  const toSender = replyNotices(fb, admin, "Thanks, fixed now.");
  assert.equal(toSender.length, 1);
  assert.deepEqual(toSender[0]!.to, { email: "Vol@islam1.org" });
  assert.equal(toSender[0]!.alert, true);
  assert.equal(toSender[0]!.href, "/feedback/FB-1#comments");
  assert.match(toSender[0]!.text, /Ada Admin replied to your portal feedback: “Thanks, fixed now.”/);

  const toAdmins = replyNotices(fb, sender, "Still happens on my phone.");
  assert.deepEqual(toAdmins.map((n) => n.to), [{ role: "admins" }]);
  assert.equal(toAdmins[0]!.alert, true);
});

test("feedback: an admin replying to their own feedback isn't told about it", () => {
  assert.deepEqual(replyNotices({ id: "FB-2", by: admin.email }, admin, "Note to self"), []);
});
