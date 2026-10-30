/**
 * What the daily job does for marketing requests, as a plain function so it
 * can be tested (daily.ts loads the cards, calls this, saves and delivers).
 *
 * - Every day: one alert to the marketing team listing new requests that
 *   reached 2 days without anyone picking them up that day. Each request
 *   is in the list once (again only if it comes back as new after a
 *   question), so nothing needs saving.
 * - Every day: a reminder to the team for scheduled or in-progress work whose
 *   done-by date is tomorrow, today or past. Once per done-by date: a new
 *   date (rescheduled) can get its own reminder.
 */
import type { Notice } from "../notices";
import { daysBetween, todayLocal } from "../dates";
import { type MarketingCard, shortDay } from "./workflow";

export type DailyPlan = {
  notices: Notice[];
  /** Cards to save, marked as reminded. */
  reminded: MarketingCard[];
};

/** Days a new request waits before the team gets a nudge about it. */
export const NUDGE_DAYS = 2;

/** `today` is YYYY-MM-DD in Raleigh. */
export function planDaily(cards: MarketingCard[], today: string): DailyPlan {
  const notices: Notice[] = [];
  const reminded: MarketingCard[] = [];

  const waiting = cards
    .filter((c) => c.marketing.stage === "review" && daysBetween(todayLocal(new Date(c.marketing.stageSince)), today) === NUDGE_DAYS)
    .sort((a, b) => a.marketing.stageSince.localeCompare(b.marketing.stageSince));
  if (waiting.length) {
    const list = waiting.slice(0, 8).map((c) => `${c.id} “${c.title}”`).join(", ");
    const more = waiting.length > 8 ? ` and ${waiting.length - 8} more` : "";
    notices.push({
      to: { role: "marketing" },
      href: "/marketing?view=team&f=new",
      text: `${waiting.length === 1 ? "A new marketing request has" : `${waiting.length} new marketing requests have`} waited ${NUDGE_DAYS} days for someone to pick ${waiting.length === 1 ? "it" : "them"} up: ${list}${more}.`,
      alert: true,
      delegable: false,
    });
  }

  for (const c of cards) {
    const m = c.marketing;
    if ((m.stage !== "scheduled" && m.stage !== "doing" && m.stage !== "ready") || !m.doneBy || m.remindedFor === m.doneBy) continue;
    const days = daysBetween(today, m.doneBy);
    if (days > 1) continue;
    const when = days === 1 ? "is due tomorrow" : days === 0 ? "is due today" : `was due ${shortDay(m.doneBy)}`;
    notices.push({
      to: { role: "marketing" },
      cardId: c.id,
      href: `/marketing/${c.id}`,
      text: `${c.id} “${c.title}” ${when}${m.stage === "scheduled" ? " and hasn't been started" : ""}.`,
      alert: true,
      delegable: false,
    });
    // Not an action anyone took, so updatedAt stays and lists keep their order.
    reminded.push({ ...c, marketing: { ...m, remindedFor: m.doneBy } });
  }
  return { notices, reminded };
}
