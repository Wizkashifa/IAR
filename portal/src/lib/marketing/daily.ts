import "server-only";
import { cardStore, ConflictError } from "../cards";
import { todayLocal } from "../away";
import { deliver } from "../notifications";
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
  const skipped = new Set<string>();
  for (const c of plan.reminded) {
    try {
      await store.save(c, c.updatedAt);
    } catch (err) {
      if (!(err instanceof ConflictError)) console.error("marketing reminder save failed", c.id, err);
      skipped.add(c.id);
    }
  }
  const notices = plan.notices.filter((n) => !n.cardId || !skipped.has(n.cardId));
  await deliver(notices, "portal");
  const reminders = notices.filter((n) => n.cardId).length;
  const weekly = notices.length - reminders;
  return `${weekly ? "Weekly review list sent. " : ""}${reminders} done-by reminder${reminders === 1 ? "" : "s"}.`;
}
