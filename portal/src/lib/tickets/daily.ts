import "server-only";
import { todayLocal } from "../away";
import { ConflictError, cardStore } from "../cards";
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
    try {
      if (shouldAutoClose(card, now)) {
        const next = autoClose(card, now);
        await store.save(next, card.updatedAt);
        await deliver(ticketNotices(card, next, system), SYSTEM, iso);
        closed++;
      } else if (needsReminder(card, now)) {
        const next = markReminded(card, now);
        await store.save(next, card.updatedAt);
        await deliver(reminderNotices(next, system), SYSTEM, iso);
        reminded++;
      }
    } catch (err) {
      // Someone changed it a moment ago: tomorrow's run will look again.
      if (!(err instanceof ConflictError)) throw err;
    }
  }
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  return `Opened ${n(opened, "preventive ticket")}, closed ${n(closed, "fixed ticket")}, sent ${n(reminded, "reminder")}.`;
}
