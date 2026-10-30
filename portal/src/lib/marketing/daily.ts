import "server-only";
import { cardStore } from "../cards";
import { saveThenTell } from "../daily-save";
import { todayLocal } from "../dates";
import { deliver } from "../notifications";
import { plural } from "../text";
import { planDaily } from "./reminders";
import { OPEN_STAGES, isMarketingCard, statusForStage } from "./workflow";

/**
 * This module's part of the daily job (lib/daily.ts): the nudge about new
 * requests nobody has picked up, and done-by reminders (rules in
 * reminders.ts). Returns a one-line summary for the log.
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
  // The nudge goes once the requests in it are marked, so none is listed twice.
  let marked = 0;
  for (const c of plan.nudged) if (await saveThenTell(store, c.updatedAt, c, [])) marked++;
  const nudge = marked ? plan.notices.filter((n) => !n.cardId) : [];
  await deliver(nudge, "portal");
  return `${nudge.length ? "Nudge about new requests sent. " : ""}${plural(reminders, "done-by reminder")}.`;
}
