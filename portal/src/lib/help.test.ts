/**
 * The help content and "What's new". Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { HELP_GUIDES, helpGuide, WHO_TO_ASK } from "./help";
import { latestWhatsNew, WHATS_NEW, whatsNewSince } from "./whats-new";
import { MODULES } from "./modules";

test("every guide has a short box of 3 to 5 steps and at least one full section", () => {
  const keys = new Set<string>();
  for (const g of HELP_GUIDES) {
    assert.ok(!keys.has(g.key), `duplicate guide ${g.key}`);
    keys.add(g.key);
    assert.ok(g.short.length >= 3 && g.short.length <= 5, `${g.key}: ${g.short.length} short steps`);
    assert.ok(g.sections.length > 0, `${g.key}: no sections`);
    for (const s of g.sections) assert.ok(s.steps.length > 0, `${g.key}: "${s.heading}" has no steps`);
    assert.equal(helpGuide(g.key), g);
  }
  assert.equal(helpGuide("nope"), undefined);
  assert.ok(WHO_TO_ASK.length > 0);
});

test("each guide points at a real, live module page", () => {
  for (const g of HELP_GUIDES) {
    if (!g.module) continue;
    const m = MODULES.find((x) => x.id === g.module);
    assert.ok(m, `${g.key}: no module ${g.module}`);
    assert.equal(m.status, "live", `${g.key}: ${g.module} isn't live`);
    assert.equal(m.href, g.href, `${g.key}: links to ${g.href}, the module is at ${m.href}`);
  }
});

test("help text is plain: short sentences, no addresses or typed-in names", () => {
  const all = HELP_GUIDES.flatMap((g) => [g.title, g.summary, ...g.short, ...g.sections.flatMap((s) => [s.heading, ...s.steps])]);
  for (const t of all) {
    assert.ok(!/@/.test(t), `an address in help text: ${t}`);
    assert.ok(t.length <= 260, `too long for a volunteer to read at a glance: ${t}`);
    assert.ok(!/\bJira|JQL|sprint\b/i.test(t), `staff jargon in help text: ${t}`);
  }
});

test("what's new: dated, newest first, and the 'since' filter", () => {
  assert.ok(WHATS_NEW.length > 0);
  for (const e of WHATS_NEW) assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
  for (let i = 1; i < WHATS_NEW.length; i++) assert.ok(WHATS_NEW[i - 1]!.date >= WHATS_NEW[i]!.date, "not newest first");
  const latest = latestWhatsNew();
  assert.equal(latest, WHATS_NEW[0]!.date);
  assert.equal(whatsNewSince("").length, WHATS_NEW.length, "someone who has seen nothing sees everything");
  assert.equal(whatsNewSince(latest).length, 0, "after dismissing, nothing until the next entry");
});
