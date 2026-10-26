import "server-only";
import { todayLocal } from "../dates";
import { cardStore } from "../cards";
import { saveThenTell } from "../daily-save";
import { plural } from "../text";
import { deliver } from "../notifications";
import { reminderNotices, ticketNotices } from "./notices";
import { scheduleStore } from "./schedule-store";
import { afterOpening, dueSchedules, ticketFromSchedule } from "./schedules";
import { type TicketCard, SYSTEM, autoClose, isTicketCard, markReminded, needsReminder, shouldAutoClose } from "./workflow";

/**
 * This module's part of the daily job (lib/daily.ts):
 * - open preventive tickets for schedules due today, and move each schedule on;
 * - close tickets marked fixed a week ago that the reporter never confirmed;
 * - remind whoever has a high or urgent ticket nobody has started in its target time (once).
 * The decisions are plain functions in workflow.ts and schedules.ts.
 * Returns a one-line summary for the log.
 */
export async function daily(now: Date): Promise<string> {
  const iso = now.toISOString();
  const today = todayLocal(now);
  const store = await cardStore();
  const system = { email: SYSTEM };

  // Preventive schedules. The schedule moves on first, so a second run the same day can't open the ticket twice.
  const schedules = await scheduleStore();
  let opened = 0;
  for (const s of dueSchedules(await schedules.list(), today)) {
    const draft = ticketFromSchedule(s, iso);
    await schedules.save(afterOpening(s, "", today, iso));
    const { id: _blank, ...toCreate } = draft;
    const created = (await store.create(toCreate, "TK")) as TicketCard;
    await schedules.save(afterOpening(s, created.id, today, iso));
    await deliver(ticketNotices(null, created, system), SYSTEM, iso);
    opened++;
  }

  let closed = 0;
  let reminded = 0;
  const open = (await store.listByType("ticket", ["submitted", "in_review", "close_out"], 2000)).filter(isTicketCard);
  for (const card of open) {
    if (shouldAutoClose(card, now)) {
      const next = autoClose(card, now);
      if (await saveThenTell(store, card.updatedAt, next, ticketNotices(card, next, system), SYSTEM, iso)) closed++;
    } else if (needsReminder(card, now)) {
      const next = markReminded(card, now);
      if (await saveThenTell(store, card.updatedAt, next, reminderNotices(next, system), SYSTEM, iso)) reminded++;
    }
  }
  return `Opened ${plural(opened, "preventive ticket")}, closed ${plural(closed, "fixed ticket")}, sent ${plural(reminded, "reminder")}.`;
}
