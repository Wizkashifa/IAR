/**
 * Changing an event's date, time, setup or cleanup from its request page,
 * without starting over. Plain functions over the card so they can be
 * tested; the server action runs the checks and calls these, and never
 * changes a stage itself.
 *
 * Rules:
 * - Only the requester, while the request is waiting or approved (a request
 *   sent back is changed with "Make changes" instead).
 * - Inside the room policy's lead time (under a week to go, when that rule is
 *   on), the date can't be changed here: the requester contacts the office.
 *   The time, setup and cleanup still can.
 * - Before approval, the new time goes through the same checks. A request
 *   waiting on an ask whose clash is gone goes on to review; one already in
 *   review stays where it is, and approvals given still count.
 * - After approval, it's a change request: the approved time stays booked
 *   until the committee's director approves the new one (an executive when
 *   there's no director). Never the requester.
 * - Every change is written to the history with the old and new values.
 */
import { daysBetween } from "../dates";
import { STEP } from "../glossary";
import { same } from "../text";
import { historyEntry, WorkflowError } from "../workflow-core";
import { lastDate } from "./closeout";
import { dayText, timeText } from "./series";
import type { Check, EventDetails, TimeEdit } from "./types";
import { type EventActor, type EventCard, STAGE_LABEL, firstDate, firstStage, liveDates, reviewersFor, withStage } from "./workflow";

/** Days before the event inside which the date can't be changed here (room policy §4, the "lead" rule). */
export const DATE_LOCK_DAYS = 7;

export const timeOf = (e: TimeEdit): TimeEdit => ({ date: e.date, start: e.start, end: e.end, setup: e.setup, teardown: e.teardown });

export const sameTime = (a: TimeEdit, b: TimeEdit) => a.date === b.date && a.start === b.start && a.end === b.end && a.setup === b.setup && a.teardown === b.teardown;

/** The next date the event happens on (its first, once they've all passed). */
export const nextDate = (card: EventCard, today: string) => card.event.dates.find((d) => d >= today) ?? firstDate(card);

export type EditPermission = { ok: true; dateLocked: boolean; lockReason?: string } | { ok: false; reason: string };

export const DATE_LOCK_REASON = `It's less than a week away, so the date can't be changed here. Contact the IAR office to move it. You can still change the time, setup and cleanup.`;

/** Can this person change the date or time, and is the date locked? `leadRule`: the room policy's lead-time rule is on. */
export function editPermission(card: EventCard, actor: Pick<EventActor, "email">, today: string, leadRule = true): EditPermission {
  if (!same(card.ownerEmail, actor.email)) return { ok: false, reason: "Only the requester can change the date or time." };
  if (card.status === "changes_requested") return { ok: false, reason: "Make the changes asked for and send it again." };
  if (!["submitted", "in_review", "approved"].includes(card.status)) return { ok: false, reason: "This request is closed." };
  if (card.event.change) return { ok: false, reason: "A new time is already waiting for approval. Withdraw it first to ask for a different one." };
  if (card.event.dates.length && lastDate(card) < today) return { ok: false, reason: "The event has already happened." };
  const dateLocked = leadRule && daysBetween(today, nextDate(card, today)) < DATE_LOCK_DAYS;
  return dateLocked ? { ok: true, dateLocked, lockReason: DATE_LOCK_REASON } : { ok: true, dateLocked };
}

/** Throws when the edit isn't allowed: nothing changed, or a locked date moved. */
export function checkEdit(card: EventCard, edit: TimeEdit, p: EditPermission): void {
  if (!p.ok) throw new WorkflowError(p.reason);
  if (sameTime(timeOf(card.event), edit)) throw new WorkflowError("Nothing changed. Pick a new date or time.");
  if (p.dateLocked && edit.date !== card.event.date) throw new WorkflowError(DATE_LOCK_REASON);
}

const span = (start: string, end: string) => `${timeText(start)}–${timeText(end)}`;

/** The old and new values, in words: "Time: 1:30–8:00 PM → 1:45–8:15 PM", "Setup: 30 → 15 min". */
export function timeChanges(before: TimeEdit, after: TimeEdit, series = false): string[] {
  const out: string[] = [];
  if (before.date !== after.date) out.push(`${series ? "First date" : "Date"}: ${dayText(before.date)} → ${dayText(after.date)}`);
  if (before.start !== after.start || before.end !== after.end) out.push(`Time: ${span(before.start, before.end)} → ${span(after.start, after.end)}`);
  if (before.setup !== after.setup) out.push(`Setup: ${before.setup} → ${after.setup} min`);
  if (before.teardown !== after.teardown) out.push(`Cleanup: ${before.teardown} → ${after.teardown} min`);
  return out;
}

const changesNote = (card: EventCard, edit: TimeEdit) => timeChanges(timeOf(card.event), edit, Boolean(card.event.recur)).join("\n");

/** The event with the new date or time, and its dates worked out again (without any it gave up). */
function applied(e: EventDetails, edit: TimeEdit): EventDetails {
  return { ...e, ...edit, dates: liveDates({ date: edit.date, recur: e.recur }, e.released) };
}

/**
 * Before approval: the new time takes effect at once. `waitingOnAsk`: the ask
 * it still waits on (the same booking is still in the way); unset when the
 * clash is gone, and a request waiting on an ask goes on to review.
 */
export function reschedule(card: EventCard, edit: TimeEdit, actor: EventActor, directors: string[], now: string, checks: Check[], o: { waitingOnAsk?: string } = {}): EventCard {
  if (card.status === "approved") throw new WorkflowError("This event is approved: ask for the change instead.");
  const e0 = card.event;
  const history = [...e0.history, historyEntry(actor.email, now, "Changed the date or time", changesNote(card, edit))];
  let stage = e0.stage;
  if (e0.stage === "slot" && !o.waitingOnAsk) {
    stage = firstStage(card.ownerEmail, directors);
    history.push(historyEntry("portal", now, `The new time no longer overlaps the booked time, so it goes on to ${STAGE_LABEL[stage].toLowerCase()}`));
  }
  const e: EventDetails = { ...applied(e0, edit), checks, stage, stageSince: stage === e0.stage ? e0.stageSince : now, waitingOnAsk: stage === "slot" ? o.waitingOnAsk : undefined, history };
  return withStage(card, e, now, directors);
}

/** Who approves a new time on an approved event: the committee's director, or an executive when there's none. Empty means the executive. */
export const changeApprovers = (card: EventCard, directors: string[]) => reviewersFor(card.ownerEmail, directors);

/** Who approves a waiting change, in words: "the director" or "an executive". */
export const changeWho = (card: EventCard, directors: string[]) => (changeApprovers(card, directors).length ? "the director" : "an executive");

/** The step a waiting change is at, in the stage names used everywhere. */
export const changeStep = (card: EventCard, directors: string[]) => (changeApprovers(card, directors).length ? STEP.director : STEP.executiveReview);

export function changePermission(card: EventCard, actor: EventActor, directors: string[]): { ok: true } | { ok: false; reason: string } {
  if (!card.event.change || card.status !== "approved") return { ok: false, reason: "No new time is waiting for approval." };
  if (same(card.ownerEmail, actor.email)) return { ok: false, reason: "You can't approve your own change." };
  const who = changeApprovers(card, directors);
  if (who.length ? !who.some((d) => same(d, actor.email)) : !actor.roles.includes("executive")) return { ok: false, reason: who.length ? "This is waiting on the committee's director." : "This is waiting on an executive." };
  return { ok: true };
}

/** After approval: asks for the new time. The approved time stays booked until it's approved. */
export function requestChange(card: EventCard, edit: TimeEdit, actor: EventActor, directors: string[], now: string, checks: Check[]): EventCard {
  if (card.status !== "approved") throw new WorkflowError("Only an approved event needs a change approved.");
  const e0 = card.event;
  const change = { ...edit, dates: liveDates({ date: edit.date, recur: e0.recur }, e0.released), by: actor.email.toLowerCase(), at: now, checks };
  const e: EventDetails = { ...e0, change, history: [...e0.history, historyEntry(actor.email, now, `Asked to change the date or time. The approved time stays booked until ${changeWho(card, directors)} approves it`, changesNote(card, edit))] };
  return withStage(card, e, now, directors, card.status);
}

export function approveChange(card: EventCard, actor: EventActor, directors: string[], now: string, note?: string): EventCard {
  const p = changePermission(card, actor, directors);
  if (!p.ok) throw new WorkflowError(p.reason);
  const e0 = card.event;
  const c = e0.change!;
  const edit = timeOf(c);
  const { change: _done, ...rest } = e0;
  const e: EventDetails = {
    ...applied(rest, edit),
    checks: c.checks,
    history: [...e0.history, historyEntry(actor.email, now, "Approved the new date or time", [changesNote(card, edit), note?.trim()].filter(Boolean).join("\n")), ...(e0.rooms.length ? [historyEntry("portal", now, "Room hold moved on the IAR calendar")] : [])],
  };
  return withStage(card, e, now, directors, card.status);
}

export function declineChange(card: EventCard, actor: EventActor, directors: string[], now: string, note: string): EventCard {
  const p = changePermission(card, actor, directors);
  if (!p.ok) throw new WorkflowError(p.reason);
  if (!note.trim()) throw new WorkflowError("Say why the new time doesn't work.");
  const { change: _dropped, ...rest } = card.event;
  const e: EventDetails = { ...rest, history: [...card.event.history, historyEntry(actor.email, now, "Kept the approved time: the new one wasn't approved", note.trim())] };
  return withStage(card, e, now, directors, card.status);
}

export function withdrawChange(card: EventCard, actor: EventActor, directors: string[], now: string): EventCard {
  if (!same(card.ownerEmail, actor.email)) throw new WorkflowError("Only the requester can withdraw the change.");
  if (!card.event.change) throw new WorkflowError("No new time is waiting for approval.");
  const { change: _dropped, ...rest } = card.event;
  const e: EventDetails = { ...rest, history: [...card.event.history, historyEntry(actor.email, now, "Withdrew the new date or time. The approved time stays")] };
  return withStage(card, e, now, directors, card.status);
}
