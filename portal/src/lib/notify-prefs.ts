/**
 * Each person's notification choices, and when a message to them goes out.
 * Plain functions with tests (notify-prefs.test.ts); lib/notifications.ts
 * uses them and the daily job sends what was held and the digests.
 *
 * - Things waiting on someone (approvals, questions, "please confirm") always
 *   reach them by Google Chat, with email as the fallback. Only the timing
 *   changes: with "Quiet overnight" (on unless they turn it off), a message
 *   that would arrive between 9 PM and 7 AM Raleigh time waits until 7 AM.
 * - Updates that aren't waiting on them (someone approved their request, a
 *   comment, a status change) go where they choose: right away in Chat, in
 *   one morning digest, or only in the portal (the default, as before).
 */

export type FyiChoice = "chat" | "digest" | "portal";

export type NotifyPrefs = {
  email: string;
  /** Where updates that aren't waiting on them go. */
  fyi: FyiChoice;
  /** Hold messages that would arrive between 9 PM and 7 AM until 7 AM. */
  quiet: boolean;
  updatedAt?: string;
};

export const FYI_CHOICES: { value: FyiChoice; label: string; hint: string }[] = [
  { value: "chat", label: "Right away in Chat", hint: "A Google Chat message from IAR Portal each time one of your requests moves or someone comments." },
  { value: "digest", label: "In the morning digest", hint: "One Chat message at 7 AM listing yesterday's updates." },
  { value: "portal", label: "Only in the portal", hint: "Updates wait for you here and on the bell. Nothing is sent." },
];

/** Raleigh time. The quiet hours are 9 PM to 7 AM there, whatever the server's clock says. */
export const TIME_ZONE = "America/New_York";
export const QUIET_FROM = 21;
export const QUIET_UNTIL = 7;

export function defaultPrefs(email: string): NotifyPrefs {
  return { email: email.toLowerCase(), fyi: "portal", quiet: true };
}

/** A stored record, or anything a form sent, as valid choices. */
export function cleanPrefs(email: string, raw: { fyi?: unknown; quiet?: unknown } | null | undefined): NotifyPrefs {
  const base = defaultPrefs(email);
  if (!raw) return base;
  const fyi = FYI_CHOICES.some((c) => c.value === raw.fyi) ? (raw.fyi as FyiChoice) : base.fyi;
  const quiet = typeof raw.quiet === "boolean" ? raw.quiet : base.quiet;
  return { ...base, fyi, quiet };
}

/** The wall-clock parts of an instant in Raleigh. */
function localParts(at: Date): { y: number; m: number; d: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), hour: get("hour") };
}

/** Raleigh's offset from UTC in minutes at this instant: -240 in summer, -300 in winter. */
function offsetMinutes(at: Date): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(at);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((wall - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** The instant it's `hour`:00 in Raleigh on that Raleigh calendar day (right on either side of the clock change). */
function raleighAt(y: number, m: number, d: number, hour: number): Date {
  const wall = Date.UTC(y, m - 1, d, hour);
  const first = wall - offsetMinutes(new Date(wall)) * 60_000;
  return new Date(wall - offsetMinutes(new Date(first)) * 60_000);
}

/** True between 9 PM and 7 AM Raleigh time. */
export function isQuietHours(now: Date): boolean {
  const { hour } = localParts(now);
  return hour >= QUIET_FROM || hour < QUIET_UNTIL;
}

/** The next 7 AM in Raleigh after `now` (today's if it's before 7, otherwise tomorrow's). */
export function nextMorning(now: Date): Date {
  const { y, m, d, hour } = localParts(now);
  if (hour < QUIET_UNTIL) return raleighAt(y, m, d, QUIET_UNTIL);
  const next = new Date(Date.UTC(y, m - 1, d + 1, 12));
  return raleighAt(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), QUIET_UNTIL);
}

/** When a message to this person should go out: now (null), or held until 7 AM. */
export function deliverAt(now: Date, prefs: Pick<NotifyPrefs, "quiet">): Date | null {
  return prefs.quiet && isQuietHours(now) ? nextMorning(now) : null;
}

/**
 * Which alerts go now and which wait for the morning. Only messages to a
 * person are held; posts in a team's Chat space ("role:finance") go when
 * they happen, since a space is shared and has no one person's choices.
 */
export function splitForQuietHours<A extends { to: string }>(alerts: A[], now: Date, prefsOf: (email: string) => Pick<NotifyPrefs, "quiet">): { send: A[]; hold: { alert: A; sendAt: Date }[] } {
  const send: A[] = [];
  const hold: { alert: A; sendAt: Date }[] = [];
  for (const a of alerts) {
    const when = a.to.startsWith("role:") ? null : deliverAt(now, prefsOf(a.to.toLowerCase()));
    if (when) hold.push({ alert: a, sendAt: when });
    else send.push(a);
  }
  return { send, hold };
}

/** What happens to an update that isn't waiting on this person. */
export function routeFyi(prefs: Pick<NotifyPrefs, "fyi">): "send" | "digest" | "none" {
  return prefs.fyi === "chat" ? "send" : prefs.fyi === "digest" ? "digest" : "none";
}

/** The morning digest's text: the updates since yesterday, newest first, at most eight listed. */
export function digestText(items: { text: string }[]): string {
  if (items.length === 0) return "";
  const shown = items.slice(0, 8).map((n) => `• ${n.text}`);
  const more = items.length > 8 ? [`…and ${items.length - 8} more in the portal.`] : [];
  return [`Good morning. ${items.length} update${items.length === 1 ? "" : "s"} on your requests since yesterday:`, ...shown, ...more].join("\n");
}
