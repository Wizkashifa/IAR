/** Calendar days as "YYYY-MM-DD", the way every module stores them. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const noon = (ymd: string) => Date.parse(`${ymd}T12:00:00Z`);

/** Today's date in Raleigh. */
export function todayLocal(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** A real calendar day ("2026-02-30" is not). */
export const isDate = (s: unknown): s is string => typeof s === "string" && DATE.test(s) && !Number.isNaN(noon(s)) && new Date(noon(s)).toISOString().startsWith(s);

/** The day `n` days later (or earlier, for negative `n`). */
export const addDays = (ymd: string, n: number) => new Date(noon(ymd) + n * 864e5).toISOString().slice(0, 10);

/** Whole days from `a` to `b`. */
export const daysBetween = (a: string, b: string) => Math.round((noon(b) - noon(a)) / 864e5);
