/**
 * Health: failures to reach Google are logged, and the admins are told at most
 * every 6 hours per service. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALERT_EVERY_MS, DEGRADED_MS, createHealth, healthMessage } from "./health";

function rig(o: { chatFails?: boolean; mailFails?: boolean } = {}) {
  let now = Date.parse("2026-10-25T13:14:00Z");
  const sent: string[] = [];
  const logs: string[] = [];
  const h = createHealth({
    async sendChat(text) {
      if (o.chatFails) throw new Error("chat down");
      sent.push(`chat: ${text}`);
    },
    async sendMail(subject) {
      if (o.mailFails) throw new Error("mail down");
      sent.push(`mail: ${subject}`);
    },
    log: (l) => logs.push(l),
    now: () => now,
  });
  return { h, sent, logs, advance: (ms: number) => (now += ms), at: () => now };
}

test("health: a failure logs one structured line and tells the admins by Chat", async () => {
  const r = rig();
  await r.h.reportFailure("directory", new Error("403"));
  const line = JSON.parse(r.logs[0]);
  assert.equal(line.severity, "ERROR");
  assert.equal(line.portalHealth, "directory");
  assert.equal(line.error, "403");
  assert.equal(r.sent.length, 1);
  assert.match(r.sent[0], /^chat: The portal couldn't reach Google Groups \(who's on which team\) since 9:14 AM\. .*finance review/);
});

test("health: at most one message per service every 6 hours, but every failure is logged", async () => {
  const r = rig();
  await r.h.reportFailure("calendar", "x");
  r.advance(60_000);
  await r.h.reportFailure("calendar", "x");
  await r.h.reportFailure("drive", "x");
  assert.equal(r.sent.length, 2, "calendar once, drive once");
  assert.equal(r.logs.length, 3);
  r.advance(ALERT_EVERY_MS);
  await r.h.reportFailure("calendar", "x");
  assert.equal(r.sent.length, 3);
});

test("health: Chat failing goes by email; email failing goes by Chat; Chat can't deliver → email", async () => {
  const a = rig();
  await a.h.reportFailure("chat", "x");
  assert.deepEqual(a.sent, ["mail: IAR Portal can't reach Google Chat"]);
  const b = rig();
  await b.h.reportFailure("mail", "x");
  assert.match(b.sent[0], /^chat: The portal couldn't reach Gmail/);
  const c = rig({ chatFails: true });
  await c.h.reportFailure("rooms", "x");
  assert.deepEqual(c.sent, ["mail: IAR Portal can't reach IAR's room list in Google"]);
});

test("health: when Chat and email both fail it only logs, and doesn't retry until 6 hours pass", async () => {
  const r = rig({ chatFails: true, mailFails: true });
  await r.h.reportFailure("drive", "x");
  await r.h.reportFailure("drive", "x");
  assert.equal(r.sent.length, 0);
  assert.equal(r.logs.filter((l) => l.includes("Couldn't tell the admins")).length, 2, "one try by Chat, one by email");
});

test("health: degraded after a failure, not after it works again or 15 minutes pass", async () => {
  const r = rig();
  assert.equal(r.h.isDegraded("directory"), false);
  await r.h.reportFailure("directory", "x");
  assert.equal(r.h.isDegraded("directory"), true);
  assert.equal(r.h.isDegraded("calendar"), false);
  r.advance(1000);
  r.h.reportOk("directory");
  assert.equal(r.h.isDegraded("directory"), false);
  r.advance(1000);
  await r.h.reportFailure("directory", "x");
  assert.equal(r.h.isDegraded("directory", r.at() + DEGRADED_MS), false);
});

test("health: a new outage after recovery reports its own start time", async () => {
  const r = rig();
  await r.h.reportFailure("calendar", "x");
  r.h.reportOk("calendar");
  r.advance(ALERT_EVERY_MS + 60 * 60 * 1000);
  await r.h.reportFailure("calendar", "x");
  assert.match(r.sent[1], /since 4:14 PM/);
  assert.match(healthMessage("drive", r.at()).text, /may not upload/);
});
