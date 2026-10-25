import "server-only";
import { cardStore } from "../cards";
import { saveThenTell } from "../daily-save";
import { todayLocal } from "../dates";
import { deliver } from "../notifications";
import { plural } from "../text";
import { planDaily } from "./reminders";
import { OPEN_STAGES, isMarketingCard, statusForStage } from "./workflow";

/**
 * This module's part of the daily job (lib/daily.ts): the Monday list for
 * the weekly review and done-by reminders (rules in reminders.ts). Returns a
 * one-line summary for the log.
 */
export async function daily(now: Date): Promise<string> {
  const store = await cardStore();
  const statuses = [...new Set(OPEN_STAGES.map(statusForStage))];
  const cards = (await store.listByType("marketing", statuses)).filter(isMarketingCard);
  const plan = planDaily(cards, todayLocal(now));

  // Mark each reminder as sent before sending it. If someone changed the
  // request at that moment, skip it today; tomorrow's run picks it up.
  let reminders = 0;
  for (const c of plan.reminded) {
    const notices = plan.notices.filter((n) => n.cardId === c.id);
    if (await saveThenTell(store, c.updatedAt, c, notices)) reminders += notices.length;
  }
  const weekly = plan.notices.filter((n) => !n.cardId);
  await deliver(weekly, "portal");
  return `${weekly.length ? "Weekly review list sent. " : ""}${plural(reminders, "done-by reminder")}.`;
}
