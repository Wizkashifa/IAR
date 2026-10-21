/**
 * Out of office: "I'm away from X to Y; send my approvals to Z."
 *
 * Plain functions so they can be tested without a server; the store is in
 * people.ts. Only approvals that wait on one named person can be handed off
 * (today: a fund's chair approval). Steps that wait on a group (finance,
 * executive) already go to everyone in that group, so nobody needs to cover them.
 *
 * Handoffs are one level: the person covering can't be away themselves at
 * the same time, so approvals never bounce from one away person to another.
 */

export type Away = {
  /** Lowercased @domain email of the person who is away. */
  email: string;
  name: string;
  /** First and last day away, inclusive, as YYYY-MM-DD in Raleigh time. */
  from: string;
  until: string;
  /** Who covers their approvals (lowercased email). */
  delegate: string;
  note?: string;
  setAt: string;
};

/** Longest single absence, so a forgotten status doesn't hand off approvals forever. */
export const MAX_AWAY_DAYS = 120;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+$/;

/** Today's date in Raleigh, as YYYY-MM-DD. */
export function todayLocal(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

const isDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().startsWith(s);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

export function isActive(a: Away, today: string): boolean {
  return a.from <= today && today <= a.until;
}

/** Away now or later (not yet over). */
export function isCurrentOrUpcoming(a: Away, today: string): boolean {
  return today <= a.until;
}

const overlaps = (a: { from: string; until: string }, b: { from: string; until: string }) => a.from <= b.until && b.from <= a.until;

/** Emails whose approvals `delegate` is covering today. */
export function coveringFor(aways: Away[], delegate: string, today: string): string[] {
  const d = delegate.toLowerCase();
  return aways.filter((a) => a.delegate === d && isActive(a, today)).map((a) => a.email);
}

export type AwayInput = { from: string; until: string; delegate: string; note?: string };

/**
 * Check an out-of-office form. `delegateAway` is the delegate's own away
 * record, if any, so a handoff can't land on someone who is also away.
 */
export function checkAway(
  input: AwayInput,
  self: { email: string; name: string },
  ctx: { today: string; domain: string; now: string; delegateAway?: Away | null },
): { ok: true; away: Away } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const from = input.from.trim();
  const until = input.until.trim();
  const delegate = input.delegate.trim().toLowerCase();
  const note = input.note?.trim().slice(0, 300) || undefined;

  if (!isDate(from)) errors.push("Pick the first day you're away.");
  if (!isDate(until)) errors.push("Pick the last day you're away.");
  if (isDate(from) && isDate(until)) {
    if (until < ctx.today) errors.push("The last day can't be in the past.");
    if (until < from) errors.push("The last day must be on or after the first day.");
    else if (daysBetween(from, until) + 1 > MAX_AWAY_DAYS) errors.push(`Keep it to ${MAX_AWAY_DAYS} days or less. Set it again when you're back if you need longer.`);
  }
  if (!delegate) errors.push("Choose who will cover your approvals.");
  else if (!EMAIL.test(delegate) || !delegate.endsWith(`@${ctx.domain}`)) errors.push(`The person covering needs an @${ctx.domain} address.`);
  else if (delegate === self.email.toLowerCase()) errors.push("Choose someone other than yourself.");
  else if (ctx.delegateAway && isDate(from) && isDate(until) && overlaps(ctx.delegateAway, { from, until }))
    errors.push(`${delegate} is away during those dates too. Choose someone else.`);

  if (errors.length) return { ok: false, errors };
  return { ok: true, away: { email: self.email.toLowerCase(), name: self.name, from: from < ctx.today ? ctx.today : from, until, delegate, note, setAt: ctx.now } };
}
