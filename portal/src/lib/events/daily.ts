import "server-only";
import { cardStore } from "../cards";
import { saveThenTell } from "../daily-save";
import { plural } from "../text";
import { directory } from "../groups";
import { closeOutNotices, dueForCloseOut, markNudged, needsNudge, startCloseOut } from "./closeout";
import { renewalDue, renewalReminder } from "./renewal";
import { todayLocal } from "../dates";
import * as sr from "./slot-requests";
import { slotRequestStore } from "./slot-requests-store";
import { isEventCard } from "./workflow";

/**
 * Events' part of the daily job:
 * - asks for a booked time that nobody has answered get a reminder after 3
 *   days and go to the director (or the executive) after 6. Nothing is ever
 *   given up automatically.
 * - approved events whose last date has passed go to close-out, waiting on
 *   the requester; a week later the requester gets a reminder.
 * - when a series' renewal opens (renewal.ts), its requester is told once.
 */
export async function daily(now: Date): Promise<string> {
  const iso = now.toISOString();
  const store = await slotRequestStore();
  const dir = await directory();
  let reminded = 0;
  let escalated = 0;
  for (const req of await store.listOpen()) {
    const next = sr.followUp(req, iso);
    if (!next) continue;
    const after = next === "remind" ? sr.markReminded(req, iso) : sr.escalate(req, dir, iso);
    if (!(await saveThenTell(store, req.updatedAt, after, sr.slotNotices(req, after, "portal")))) continue;
    if (next === "remind") reminded++;
    else escalated++;
  }

  const today = todayLocal(now);
  const cards = await cardStore();
  let closing = 0;
  let nudged = 0;
  let renewals = 0;
  for (const card of (await cards.listByType("event", ["approved", "close_out"])).filter(isEventCard)) {
    if (renewalDue(card, today)) {
      const r = renewalReminder(card, iso);
      if (await saveThenTell(cards, card.updatedAt, r.card, [r.notice])) renewals++;
      continue;
    }
    const after = dueForCloseOut(card, today) ? startCloseOut(card, iso) : needsNudge(card, today) ? markNudged(card, iso) : null;
    if (!after) continue;
    if (!(await saveThenTell(cards, card.updatedAt, after, closeOutNotices(card, after, null)))) continue;
    if (after.status !== card.status) closing++;
    else nudged++;
  }
  return `${plural(reminded, "ask")} reminded, ${escalated} sent to the director. ${plural(closing, "event")} moved to close-out, ${nudged} reminded to close out, ${renewals} series told renewal is open.`;
}
