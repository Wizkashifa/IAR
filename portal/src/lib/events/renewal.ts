/**
 * Renewing a repeating event. Every series ends (series.ts); a few weeks
 * before it does, the requester (or the office) can request the next period.
 * The renewal is a new request: same details, the next dates, the same
 * checks and approval. Plain functions so they can be tested.
 */
import type { Notice } from "../purchases/notices";
import { longDate, occurrences, seriesMaxEnd } from "./series";
import type { Recurrence } from "./types";
import type { EventCard } from "./workflow";
import { addDays } from "../dates";

/** Renewal opens this many days before a series ends. */
export const RENEW_DAYS = 30;

export const renewalOpens = (r: Recurrence) => addDays(r.until, -RENEW_DAYS);

/** The first date of the next period: the same pattern, carried on past the end date. */
export function nextPeriodStart(start: string, r: Recurrence): string {
  return occurrences(start, { ...r, until: addDays(r.until, 70) }).find((d) => d > r.until) ?? addDays(r.until, 7);
}

/** The next period's dates: from the next start, as long as a series may run. */
export function nextPeriod(start: string, r: Recurrence): { date: string; recur: Recurrence } {
  const date = nextPeriodStart(start, r);
  return { date, recur: { freq: r.freq, until: seriesMaxEnd(date) } };
}

export type RenewalState =
  | { can: true }
  | { can: false; why: string; opens?: string };

/**
 * Whether this person can request the next period now. `next`: the request
 * that already renewed it, if any (a denied or cancelled one doesn't count).
 */
export function renewalState(card: EventCard, who: { email: string; office: boolean }, today: string, next?: EventCard | null): RenewalState {
  const r = card.event.recur;
  if (!r) return { can: false, why: "Only a repeating event can be renewed." };
  if (card.status !== "approved") return { can: false, why: "Only an approved series can be renewed." };
  if (card.ownerEmail.toLowerCase() !== who.email.toLowerCase() && !who.office) return { can: false, why: "The requester or the office can renew it." };
  if (next && next.status !== "denied" && next.status !== "cancelled") return { can: false, why: `The next period is already requested (${next.id}).` };
  if (today > r.until) return { can: false, why: `This series ended ${longDate(r.until)}. Make a new request.` };
  const opens = renewalOpens(r);
  if (today < opens) return { can: false, why: `Renewal opens ${longDate(opens)}, ${RENEW_DAYS} days before the series ends.`, opens };
  return { can: true };
}

/** A renewal must start after the series it renews ends. */
export function checkRenewalDates(prior: EventCard, date: string): string | null {
  const r = prior.event.recur;
  if (r && date <= r.until) return `The next period has to start after the current one ends on ${longDate(r.until)}.`;
  return null;
}

/** Series whose renewal just opened and whose requester hasn't been told: the daily job tells them once. */
export function renewalDue(card: EventCard, today: string): boolean {
  const r = card.event.recur;
  return Boolean(r && card.status === "approved" && !card.event.renewedBy && !card.event.renewalNotified && today >= renewalOpens(r) && today <= r.until);
}

/** The reminder that renewal is open, and the card marked as told. */
export function renewalReminder(card: EventCard, now: string): { card: EventCard; notice: Notice } {
  const r = card.event.recur!;
  return {
    card: { ...card, event: { ...card.event, renewalNotified: now } },
    notice: { to: { email: card.ownerEmail }, cardId: card.id, href: `/events/${card.id}`, text: `${card.id} “${card.title}” ends ${longDate(r.until)}. To keep the room, request the next period now.`, alert: true, delegable: false },
  };
}
