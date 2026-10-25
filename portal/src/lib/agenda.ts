import "server-only";
import { cardStore } from "./cards";
import { eventContext } from "./events/context";
import { roomsToCheck } from "./events/rooms";
import { eventDates } from "./events/series";
import { isEventCard } from "./events/workflow";
import { type AgendaItem, type RoomNeed, type RoomOption, agendaFrom, freeRoomsFrom } from "./agenda-core";

/**
 * Reads the room calendars (the IAR calendar is the source of truth) and the
 * event requests, and hands them to the plain functions in agenda-core.ts.
 * Nothing is copied or stored.
 */

export type { AgendaItem, RoomNeed, RoomOption } from "./agenda-core";

/** Everything booked between two dates (inclusive), across every room or one campus. */
export async function agendaBetween(from: string, to: string, opts: { campus?: string; roomIds?: string[]; standing?: boolean } = {}): Promise<AgendaItem[]> {
  const ctx = await eventContext();
  const rooms = ctx.rooms.filter((r) => (!opts.campus || (r.building || "") === opts.campus) && (!opts.roomIds || opts.roomIds.includes(r.id)));
  if (!rooms.length || to < from) return [];
  const [busy, cards] = await Promise.all([
    ctx.calendar.listBusy(rooms.map((r) => ({ roomId: r.id, calendarId: r.calendarId })), from, to),
    (await cardStore()).listByType("event", ["submitted", "in_review", "approved", "close_out"]),
  ]);
  return agendaFrom(busy, ctx.rooms, cards.filter(isEventCard), { standing: opts.standing });
}

/** Bookable rooms for a need, free ones first. `mayBookRestricted` is the viewer's (lib/events/context.ts). */
export async function freeRooms(need: RoomNeed, mayBookRestricted: boolean): Promise<RoomOption[]> {
  const ctx = await eventContext();
  const candidates = ctx.bookable.filter((r) => !need.campus || (r.building || "") === need.campus);
  const dates = eventDates(need.date, need.recur);
  if (!candidates.length || !dates.length) return [];
  const cals = roomsToCheck(candidates.map((r) => r.id), ctx.rooms).map((r) => ({ roomId: r.id, calendarId: r.calendarId }));
  const dateSet = new Set(dates);
  const busy = (await ctx.calendar.listBusy(cals, dates[0], dates[dates.length - 1])).filter((b) => dateSet.has(b.date));
  return freeRoomsFrom(need, ctx.rooms, busy, { rules: ctx.rules, mayBookRestricted });
}
