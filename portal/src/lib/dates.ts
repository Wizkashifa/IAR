/** Calendar days as "YYYY-MM-DD", the way every module stores them. */

/** IAR's time zone: every date and time the portal shows or stores is Raleigh's. */
export const TIME_ZONE = "America/New_York";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const noon = (ymd: string) => Date.parse(`${ymd}T12:00:00Z`);

/** Today's date in Raleigh. */
export function todayLocal(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

/** A real calendar day ("2026-02-30" is not). */
export const isDate = (s: unknown): s is string => typeof s === "string" && DATE.test(s) && !Number.isNaN(noon(s)) && new Date(noon(s)).toISOString().startsWith(s);

/** The day `n` days later (or earlier, for negative `n`). */
export const addDays = (ymd: string, n: number) => new Date(noon(ymd) + n * 864e5).toISOString().slice(0, 10);

/** Whole days from `a` to `b`. */
export const daysBetween = (a: string, b: string) => Math.round((noon(b) - noon(a)) / 864e5);

/** Minutes Raleigh's clock is from UTC at an instant (-240 in summer, -300 in winter). */
function raleighOffset(ms: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return Math.round((local - Math.floor(ms / 60000) * 60000) / 60000);
}

/**
 * The same time of day (in Raleigh) on the next business day, Monday to
 * Friday, as an ISO time: Wednesday → Thursday, Friday or Saturday → Monday.
 * Holidays aren't counted.
 */
export function nextBusinessDay(iso: string): string {
  const t = Date.parse(iso);
  const weekday = new Date(noon(todayLocal(new Date(t)))).getUTCDay(); // 0 Sunday … 6 Saturday
  const days = weekday === 5 ? 3 : weekday === 6 ? 2 : 1;
  // Across a clock change, keep the same time on the clock.
  const r = t + days * 864e5;
  return new Date(r + (raleighOffset(t) - raleighOffset(r)) * 60000).toISOString();
}
