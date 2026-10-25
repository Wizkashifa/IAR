/**
 * The plain functions behind the Calendar page (app/calendar): which days a
 * week or month view shows, narrowing the agenda to a room or a committee,
 * reading "Find a room" from the address bar, and the link that opens the
 * event form filled in. Dates are "YYYY-MM-DD", times "HH:MM", in Raleigh.
 */
import type { AgendaItem, RoomNeed } from "./agenda-core";
import { type Room, roomsOverlap } from "./events/rooms";
import { addDays, addMonths, dayOfWeek, isDate, isTime, toMinutes } from "./events/series";

export type CalendarView = "week" | "month";

/** The Sunday a week starts on (the IAR calendar's weeks run Sunday to Saturday). */
export const weekStart = (date: string) => addDays(date, -dayOfWeek(date));

/** The seven days of the week holding `date`. */
export function weekDays(date: string): string[] {
  const first = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** A month as whole weeks, Sunday first, with the days from the months either side marked. */
export function monthWeeks(date: string): { date: string; inMonth: boolean }[][] {
  const month = date.slice(0, 7);
  const first = weekStart(`${month}-01`);
  const weeks: { date: string; inMonth: boolean }[][] = [];
  for (let d = first; weeks.length < 6; ) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(d, i)).map((x) => ({ date: x, inMonth: x.slice(0, 7) === month }));
    if (weeks.length > 0 && !week.some((x) => x.inMonth)) break;
    weeks.push(week);
    d = addDays(d, 7);
  }
  return weeks;
}

/** The first and last day a view shows, for reading the calendar. */
export function viewRange(view: CalendarView, date: string): { from: string; to: string } {
  if (view === "week") {
    const days = weekDays(date);
    return { from: days[0], to: days[6] };
  }
  const weeks = monthWeeks(date);
  return { from: weeks[0][0].date, to: weeks[weeks.length - 1][6].date };
}

/** Where "Previous" and "Next" go: a week or a month either way. */
export function stepView(view: CalendarView, date: string, by: -1 | 1): string {
  return view === "week" ? addDays(weekStart(date), 7 * by) : `${addMonths(`${date.slice(0, 7)}-01`, by)}`;
}

export type AgendaFilter = { roomId?: string; committee?: string; standing?: boolean };

/**
 * The entries a filter keeps. A room keeps what's on it and on rooms sharing
 * its space (the full gym blocks each half). A committee keeps only portal
 * requests from it. Standing holds (prayers, school, the pantry) only when asked.
 */
export function filterAgenda(items: AgendaItem[], rooms: Room[], f: AgendaFilter): AgendaItem[] {
  const room = f.roomId ? rooms.find((r) => r.id === f.roomId) : undefined;
  return items.filter((a) => {
    if (a.source === "standing" && !f.standing) return false;
    if (f.committee && a.committee !== f.committee) return false;
    if (room && !a.roomIds.some((id) => roomsOverlap(room, rooms.find((r) => r.id === id)))) return false;
    return true;
  });
}

/** Entries by day, in time order (agendaFrom already sorts them). */
export function byDay(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const out = new Map<string, AgendaItem[]>();
  for (const a of items) out.set(a.date, [...(out.get(a.date) ?? []), a]);
  return out;
}

/** The committees with requests in view, for the filter. */
export const committeesIn = (items: AgendaItem[]): string[] => [...new Set(items.map((a) => a.committee).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b));

/** "Find a room" as typed into the form (the address bar's ?date=&start=&end=&people=&food=). */
export type FindQuery = { date?: string; start?: string; end?: string; people?: string; food?: string };

export const MAX_PEOPLE = 2000;

/**
 * What someone needs a room for, or what to fix. Nothing is asked until a
 * date is given, so an empty form shows no errors.
 */
export function readNeed(q: FindQuery, today: string): { need?: RoomNeed; errors: string[] } {
  if (!q.date) return { errors: [] };
  const errors: string[] = [];
  if (!isDate(q.date)) errors.push("Pick a date.");
  else if (q.date < today) errors.push("Pick today or a later date.");
  if (!isTime(q.start)) errors.push("Pick a start time.");
  if (!isTime(q.end)) errors.push("Pick an end time.");
  if (isTime(q.start) && isTime(q.end) && toMinutes(q.end) <= toMinutes(q.start)) errors.push("The end time has to be after the start time.");
  const people = Number(q.people);
  if (!Number.isInteger(people) || people < 1 || people > MAX_PEOPLE) errors.push("Say about how many people will come.");
  if (errors.length) return { errors };
  return { need: { date: q.date, start: q.start!, end: q.end!, attendance: people, food: q.food === "1" }, errors };
}

/** The event form, filled in with the need and this room. */
export function requestHref(need: RoomNeed, roomId: string): string {
  const q = new URLSearchParams({ date: need.date, start: need.start, end: need.end, room: roomId, people: String(need.attendance) });
  if (need.food) q.set("food", "1");
  return `/events/new?${q}`;
}

/** What the event form starts with, from the link above. Anything unreadable is left for the person to fill in. */
export type EventPrefill = { date?: string; start?: string; end?: string; rooms?: string[]; attendance?: number; food?: boolean };

export function readPrefill(q: { date?: string; start?: string; end?: string; room?: string; people?: string; food?: string }, bookable: string[], today: string): EventPrefill {
  const out: EventPrefill = {};
  if (isDate(q.date) && q.date >= today) out.date = q.date;
  if (isTime(q.start) && isTime(q.end) && toMinutes(q.end) > toMinutes(q.start)) {
    out.start = q.start;
    out.end = q.end;
  }
  if (q.room && bookable.includes(q.room)) out.rooms = [q.room];
  const people = Number(q.people);
  if (Number.isInteger(people) && people >= 1 && people <= MAX_PEOPLE) out.attendance = people;
  if (q.food === "1") out.food = true;
  return out;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** What the view shows, in words: "Oct 25 – 31, 2026", "Dec 27, 2026 – Jan 2, 2027", "November 2026". */
export function viewTitle(view: CalendarView, date: string): string {
  const [y, m] = date.split("-").map(Number);
  if (view === "month") return `${MONTHS[m - 1]} ${y}`;
  const days = weekDays(date);
  const part = (s: string) => {
    const [yy, mm, dd] = s.split("-").map(Number);
    return { y: yy, mon: MONTHS[mm - 1].slice(0, 3), d: dd };
  };
  const a = part(days[0]), b = part(days[6]);
  if (a.y !== b.y) return `${a.mon} ${a.d}, ${a.y} – ${b.mon} ${b.d}, ${b.y}`;
  if (a.mon !== b.mon) return `${a.mon} ${a.d} – ${b.mon} ${b.d}, ${b.y}`;
  return `${a.mon} ${a.d} – ${b.d}, ${b.y}`;
}
