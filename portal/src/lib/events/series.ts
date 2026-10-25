/**
 * Dates and repeating events, all as "YYYY-MM-DD" and "HH:MM" in Raleigh
 * time. A series always ends: at most SERIES_MAX_MONTHS after its first date,
 * then it's renewed as a new request. Plain functions so they can be tested.
 */
import type { RecurFreq, Recurrence } from "./types";
import { addDays, daysBetween } from "../dates";

export const SERIES_MAX_MONTHS = 3;

export const RECUR_LABEL: Record<RecurFreq, string> = { weekly: "Every week", biweekly: "Every 2 weeks", monthly: "Monthly, same weekday" };

const pad = (n: number) => String(n).padStart(2, "0");
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const isTime = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function addMonths(s: string, n: number): string {
  const d = parse(s);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fmt(d);
}
export const dayOfWeek = (s: string) => parse(s).getUTCDay();
/** Which week of the month the date is in: 1 for the 1st–7th, and so on. */
export const weekOfMonth = (s: string) => Math.ceil(parse(s).getUTCDate() / 7);

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const fromMinutes = (m: number) => `${pad(Math.floor(Math.max(0, Math.min(1439, m)) / 60))}:${pad(Math.max(0, Math.min(1439, m)) % 60)}`;

/** The latest a series starting on `start` may end. */
export const seriesMaxEnd = (start: string, months = SERIES_MAX_MONTHS) => addDays(addMonths(start, months), -1);

/** Every date of a series, from its first date to `until`, inclusive. */
export function occurrences(start: string, r: Recurrence): string[] {
  const out: string[] = [];
  if (r.until < start) return out;
  const dow = dayOfWeek(start);
  const nth = weekOfMonth(start);
  for (let d = start; d <= r.until; d = addDays(d, 1)) {
    if (dayOfWeek(d) !== dow) continue;
    if (r.freq === "biweekly" && (daysBetween(start, d) / 7) % 2 !== 0) continue;
    if (r.freq === "monthly" && weekOfMonth(d) !== nth) continue;
    out.push(d);
  }
  return out;
}

/** The dates an event happens on. */
export function eventDates(date: string, recur?: Recurrence): string[] {
  return recur ? occurrences(date, recur) : [date];
}

const DOW_LONG = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const NTH = ["1st", "2nd", "3rd", "4th", "5th"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sat, Nov 7". */
export function dayText(s: string): string {
  const d = parse(s);
  return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
/** "Nov 7, 2026". */
export function longDate(s: string): string {
  const d = parse(s);
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
/** "6:30 PM". */
export function timeText(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
}
/** "Every Tuesday", "Every other Tuesday", "Monthly on the 2nd Tuesday". */
export function recurText(start: string, r: Recurrence): string {
  const day = DOW_LONG[dayOfWeek(start)];
  if (r.freq === "monthly") return `Monthly on the ${NTH[weekOfMonth(start) - 1]} ${day.slice(0, -1)}`;
  return `${r.freq === "biweekly" ? "Every other" : "Every"} ${day.slice(0, -1)}`;
}

/** Google Calendar's repeat rule for a series (RFC 5545), ending on its last date. */
export function rrule(start: string, r: Recurrence): string {
  const until = r.until.replace(/-/g, "") + "T235959Z";
  const day = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][dayOfWeek(start)];
  if (r.freq === "monthly") return `RRULE:FREQ=MONTHLY;BYDAY=${weekOfMonth(start)}${day};UNTIL=${until}`;
  return `RRULE:FREQ=WEEKLY;INTERVAL=${r.freq === "biweekly" ? 2 : 1};BYDAY=${day};UNTIL=${until}`;
}

