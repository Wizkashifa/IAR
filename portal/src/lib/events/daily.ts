import "server-only";
import { cardStore } from "../cards";
import { deliver } from "../notifications";
import { directory } from "../groups";
import { closeOutNotices, dueForCloseOut, markNudged, needsNudge, startCloseOut } from "./closeout";
import { todayInRaleigh } from "./series";
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
    try {
      await store.save(after, req.updatedAt);
    } catch {
      continue;
    }
    await deliver(sr.slotNotices(req, after, "portal"), "portal");
    if (next === "remind") reminded++;
    else escalated++;
  }

  const today = todayInRaleigh(now);
  const cards = await cardStore();
  let closing = 0;
  let nudged = 0;
  for (const card of (await cards.listByType("event", ["approved", "close_out"])).filter(isEventCard)) {
    const after = dueForCloseOut(card, today) ? startCloseOut(card, iso) : needsNudge(card, today) ? markNudged(card, iso) : null;
    if (!after) continue;
    try {
      await cards.save(after, card.updatedAt);
    } catch {
      continue;
    }
    await deliver(closeOutNotices(card, after, null), "portal");
    if (after.status !== card.status) closing++;
    else nudged++;
  }
  const s = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${s(reminded, "ask")} reminded, ${escalated} sent to the director. ${s(closing, "event")} moved to close-out, ${nudged} reminded to close out.`;
}
