/**
 * Close-out after the event (docs/plan.md, "The event card"). The morning
 * after an approved event's last date, the daily job moves it to close-out
 * and the requester is asked for the actual attendance, how it went, and to
 * confirm the final costs: the purchase requests linked to the event. A week
 * later they get a reminder. Submitting closes the card; the IAR office can
 * close it for them. Plain functions so they can be tested.
 */
import type { Card } from "../cards";
import type { Notice } from "../notices";
import { purchaseTotal } from "../purchases/types";
import { dayText } from "./series";
import type { CloseOut } from "./types";
import { type EventActor, type EventCard, withStage } from "./workflow";
import { lc } from "../text";
import { daysBetween } from "../dates";
import { historyEntry, WorkflowError } from "../workflow-core";

/** Days in close-out before the requester is reminded. */
export const NUDGE_DAYS = 7;

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const lastDate = (card: EventCard) => card.event.dates[card.event.dates.length - 1] ?? card.event.date;

/** Approved, and its last date has passed. */
export const dueForCloseOut = (card: EventCard, today: string) => card.status === "approved" && card.event.dates.length > 0 && lastDate(card) < today;

/** The event is over: it waits on the requester for attendance and final costs. */
export function startCloseOut(card: EventCard, now: string, directors: string[] = []): EventCard {
  const e = { ...card.event, closeOutSince: now, history: [...card.event.history, historyEntry("portal", now, "The event is over. Waiting on the requester to close it out: attendance and final costs")] };
  return withStage(card, e, now, directors, "close_out");
}

/** In close-out for a week without being closed, and not reminded yet. */
export function needsNudge(card: EventCard, today: string): boolean {
  const since = card.event.closeOutSince;
  return card.status === "close_out" && Boolean(since) && !card.event.closeOutNudged && daysBetween(since!.slice(0, 10), today) >= NUDGE_DAYS;
}

export function markNudged(card: EventCard, now: string): EventCard {
  return { ...card, event: { ...card.event, closeOutNudged: now, history: [...card.event.history, historyEntry("portal", now, "Reminded the requester to close out the event")] }, updatedAt: now };
}

// ---- Linked purchases --------------------------------------------------------

/** Purchase requests linked to the event that still count: not cancelled or rejected. */
export function linkedPurchases(cards: Card[], eventId: string): Card[] {
  return cards.filter((c) => c.type === "purchase" && c.purchase?.eventCardId === eventId && c.status !== "cancelled" && c.status !== "denied");
}

/** Actual spend: the total of the linked purchases. */
export function spendOf(purchases: Card[]): number {
  return Math.round(purchases.reduce((s, c) => s + (c.purchase ? purchaseTotal(c.purchase) : 0), 0) * 100) / 100;
}

/** "$310.00 of the $400.00 budget (78%)". */
export function spendText(spent: number, budget: number): string {
  return budget > 0 ? `${money(spent)} of the ${money(budget)} budget (${Math.round((spent / budget) * 100)}%)` : `${money(spent)} (no budget given)`;
}

// ---- Closing ---------------------------------------------------------------------

export type CloseOutInput = { attendance: string | number; notes: string; costsConfirmed: boolean; depositRefund?: boolean };

const isOffice = (actor: EventActor) => actor.roles.includes("office");

export function closeOutPermission(card: EventCard, actor: EventActor): { ok: true } | { ok: false; reason: string } {
  if (card.status !== "close_out") return { ok: false, reason: card.status === "closed" ? "This event is already closed." : "This event isn't waiting for close-out." };
  if (lc(card.ownerEmail) !== lc(actor.email) && !isOffice(actor)) return { ok: false, reason: "Only the requester or the IAR office can close out this event." };
  return { ok: true };
}

/**
 * Close the event. The requester gives the actual attendance and confirms
 * the costs; the office can close it for them without either. `spent` is the
 * linked purchases' total now, kept with the close-out.
 */
export function submitCloseOut(card: EventCard, actor: EventActor, now: string, input: CloseOutInput, spent: number, directors: string[] = []): EventCard {
  const p = closeOutPermission(card, actor);
  if (!p.ok) throw new WorkflowError(p.reason);
  const owner = lc(card.ownerEmail) === lc(actor.email);
  const errors: string[] = [];
  const raw = String(input.attendance ?? "").trim();
  const n = raw === "" ? undefined : Number(raw);
  if (n !== undefined && (!Number.isInteger(n) || n < 0 || n > 100000)) errors.push("Enter the actual attendance as a whole number.");
  if (owner && n === undefined) errors.push("Enter about how many people came.");
  if (owner && !input.costsConfirmed) errors.push("Confirm the final costs: the purchase requests linked to this event. Link any missing ones first.");
  if (errors.length) throw new WorkflowError(errors.join(" "));
  const notes = String(input.notes ?? "").trim().slice(0, 2000);
  const byOffice = !owner;
  const closeOut: CloseOut = {
    ...(n !== undefined ? { attendance: n } : {}),
    notes,
    costsConfirmed: Boolean(input.costsConfirmed),
    spent,
    ...(byOffice && input.depositRefund ? { depositRefund: true } : {}),
    by: lc(actor.email),
    at: now,
    ...(byOffice ? { byOffice: true } : {}),
  };
  const summary = [n !== undefined ? `${n} came` : "", `spent ${money(spent)}`, closeOut.depositRefund ? "deposit refund needed" : ""].filter(Boolean).join(", ");
  const e = {
    ...card.event,
    stage: "done" as const,
    stageSince: now,
    closeOut,
    history: [...card.event.history, historyEntry(actor.email, now, `${byOffice ? "Closed out by the IAR office" : "Closed out"}: ${summary}`, notes || undefined)],
  };
  return withStage(card, e, now, directors);
}

/** Who hears about close-out: the requester when it starts (portal) and a week on (an alert); the requester when the office closed it; finance when a deposit is to be refunded. */
export function closeOutNotices(before: EventCard, after: EventCard, actor: EventActor | null): Notice[] {
  const what = `${after.id} “${after.title}” (${dayText(lastDate(after))})`;
  const href = `/events/${after.id}#closeout`;
  const owner = { email: after.ownerEmail };
  const out: Notice[] = [];
  const note = (to: Notice["to"], text: string, alert: boolean) => out.push({ to, cardId: after.id, href, text, alert, delegable: false });
  if (before.status === "approved" && after.status === "close_out") note(owner, `${what} is over. Close it out: the actual attendance, how it went, and confirm the final costs.`, false);
  else if (after.status === "close_out" && after.event.closeOutNudged && !before.event.closeOutNudged) note(owner, `Reminder: ${what} still needs closing out. It takes a minute: attendance, how it went, and the final costs.`, true);
  else if (before.status === "close_out" && after.status === "closed") {
    const c = after.event.closeOut;
    if (c?.byOffice && (!actor || lc(actor.email) !== lc(after.ownerEmail))) note(owner, `The IAR office closed out ${what}.`, false);
    if (c?.depositRefund) note({ role: "finance" }, `${what} is closed out. The deposit should be refunded to the requester.`, true);
  }
  return out;
}
