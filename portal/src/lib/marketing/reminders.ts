/**
 * What the daily job does for marketing requests, as a plain function so it
 * can be tested (daily.ts loads the cards, calls this, saves and delivers).
 *
 * - Mondays: one alert to the marketing team listing the requests waiting
 *   for the weekly review, if there are any.
 * - Every day: a reminder to the team for scheduled or in-progress work whose
 *   done-by date is tomorrow, today or past. Once per done-by date: a new
 *   date (rescheduled) can get its own reminder.
 */
import type { Notice } from "../purchases/notices";
import { daysBetween } from "../dates";
import { type MarketingCard, shortDay } from "./workflow";

export type DailyPlan = {
  notices: Notice[];
  /** Cards to save, marked as reminded. */
  reminded: MarketingCard[];
};

export const isMonday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay() === 1;

/** `today` is YYYY-MM-DD in Raleigh. */
export function planDaily(cards: MarketingCard[], today: string): DailyPlan {
  const notices: Notice[] = [];
  const reminded: MarketingCard[] = [];

  if (isMonday(today)) {
    const waiting = cards.filter((c) => c.marketing.stage === "review").sort((a, b) => a.marketing.stageSince.localeCompare(b.marketing.stageSince));
    if (waiting.length) {
      const list = waiting.slice(0, 8).map((c) => `${c.id} “${c.title}”`).join(", ");
      const more = waiting.length > 8 ? ` and ${waiting.length - 8} more` : "";
      notices.push({
        to: { role: "marketing" },
        href: "/marketing",
        text: `Weekly review: ${waiting.length} marketing request${waiting.length === 1 ? " is" : "s are"} waiting: ${list}${more}.`,
        alert: true,
        delegable: false,
      });
    }
  }

  for (const c of cards) {
    const m = c.marketing;
    if ((m.stage !== "scheduled" && m.stage !== "doing") || !m.doneBy || m.remindedFor === m.doneBy) continue;
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
