/**
 * Event request rules, as plain functions over a card so they can be tested
 * without a server. Pages and server actions call these; they never change
 * an event card's stage themselves. The room holds on Google Calendar follow
 * from the stage (holdsWanted), and lib/events/holds.ts carries them out.
 *
 * Rules (docs/plan.md, "The event card"):
 * - Every event gets mission review: the committee's pillar director, then any
 *   one executive. The director step is skipped when the committee has no
 *   director, or the requester is that director. Nobody reviews their own event.
 * - The IAR office and portal admins don't review events.
 * - A request that clashes with a booking can ask the holder for the time
 *   (slot-requests.ts); it holds nothing and waits for the answer first.
 * - An event moved to give up its time needs only the director's approval,
 *   and is approved straight away when there's no director.
 * - Submitting puts a tentative hold on each room's calendar; approval
 *   confirms it; sending back, denying or cancelling takes it off.
 * - Every step is written to the card's history.
 */
import type { Card, CardStatus } from "../cards";
import { ORG, type Role } from "../org";
import { eventDates, recurText, longDate, dayText } from "./series";
import { newlyUnlockedTeams, planTasks, syncTasks, teamList } from "./tasks";
import type { Check, EventApproval, EventDetails, EventInput, EventStage } from "./types";
import { lc, same } from "../text";
import { historyEntry, must, WorkflowError } from "../workflow-core";

export type EventCard = Card & { type: "event"; event: EventDetails };

/** Who is acting: their own group roles (never the admin expansion). */
export type EventActor = { email: string; name: string; roles: Role[] };


export function isEventCard(c: Card | null | undefined): c is EventCard {
  return Boolean(c && c.type === "event" && c.event);
}

export const STAGE_LABEL: Record<EventStage, string> = {
  slot: "Waiting on a room answer",
  director: "Director review",
  mission: "Executive review",
  approved: "Approved",
  done: "Closed",
};

/** The committee's directors who can review it: never the requester. */
export const reviewersFor = (ownerEmail: string, directors: string[]) => directors.filter((d) => !same(d, ownerEmail));

/** Where a submitted (or resubmitted) request goes first. */
function firstStage(ownerEmail: string, directors: string[], o: { waitingOnAsk?: string; releasedFor?: string } = {}): EventStage {
  if (o.waitingOnAsk) return "slot";
  const reviewers = reviewersFor(ownerEmail, directors);
  if (o.releasedFor) return reviewers.length ? "director" : "approved";
  return reviewers.length ? "director" : "mission";
}

export function statusForStage(stage: EventStage): CardStatus {
  switch (stage) {
    case "slot":
      return "submitted";
    case "director":
    case "mission":
      return "in_review";
    case "approved":
      return "approved";
    case "done":
      return "closed";
  }
}

/** What the card is waiting on, in words, for My Requests and the lists. */
export function waitingOnFor(card: EventCard, directors: string[] = []): string | undefined {
  const e = card.event;
  if (card.status === "changes_requested") return e.releasedFor ? "You: pick a new time (only the director needs to approve it)" : `You: ${e.returnNote ?? "make the requested changes"}`;
  if (card.status === "denied" || card.status === "cancelled" || card.status === "closed") return undefined;
  if (card.status === "close_out") return "You: attendance and final costs";
  switch (e.stage) {
    case "slot":
      return "An answer to your ask for a booked time";
    case "director": {
      const who = reviewersFor(card.ownerEmail, directors);
      return `Director review${who.length ? `: ${who.join(", ")}` : ""}`;
    }
    case "mission":
      return "Executive review";
    case "approved":
      return undefined;
    case "done":
      return undefined;
  }
}

/** The calendar holds this card should have now. "keep": leave them as they are. */
export function holdsWanted(card: EventCard): "none" | "tentative" | "confirmed" | "keep" {
  if (!card.event.rooms.length) return "none";
  if (card.status === "changes_requested") return card.event.releasedFor ? "keep" : "none";
  if (card.status === "denied" || card.status === "cancelled") return "none";
  if (card.status === "approved" || card.status === "close_out" || card.status === "closed") return "confirmed";
  if (card.event.stage === "director" || card.event.stage === "mission") return "tentative";
  return "none";
}

// ---- Who can act ---------------------------------------------------------

export type EventAction = "approve" | "return" | "deny" | "cancel" | "resubmit";

export function permission(card: EventCard, actor: EventActor, action: EventAction, directors: string[] = []): { ok: true } | { ok: false; reason: string } {
  const e = card.event;
  const own = same(card.ownerEmail, actor.email);
  const no = (reason: string) => ({ ok: false as const, reason });
  const closed = card.status === "denied" || card.status === "cancelled" || card.status === "closed" || card.status === "close_out";

  if (action === "cancel") {
    if (!own) return no("Only the requester can cancel an event request.");
    if (closed) return no("This request is already closed.");
    return { ok: true };
  }
  if (action === "resubmit") {
    if (!own) return no("Only the requester can resubmit.");
    if (card.status !== "changes_requested") return no("This request isn't waiting for changes.");
    return { ok: true };
  }
  if (closed || card.status === "changes_requested" || card.status === "approved") return no("This request isn't waiting on a reviewer.");
  if (e.stage === "slot") return no("This request is waiting for an answer about a booked time first.");
  if (own) return no("You can't review your own event.");
  if (e.stage === "director") {
    if (!reviewersFor(card.ownerEmail, directors).some((d) => same(d, actor.email))) return no("This is waiting on the committee's director.");
    return { ok: true };
  }
  if (e.stage === "mission") {
    if (!actor.roles.includes("executive")) return no("This is waiting on executive review.");
    return { ok: true };
  }
  return no("This request isn't waiting on a reviewer.");
}

function mustDo(card: EventCard, actor: EventActor, action: EventAction, directors: string[]) {
  must(permission(card, actor, action, directors));
}

// ---- Transitions ---------------------------------------------------------
// Each returns a new card; the caller saves it and syncs the calendar holds.


/**
 * Team tasks follow the card: an approved event gets the tasks it needs
 * (keeping any already worked on), and a cancelled or denied one has none.
 */
function withTasks(e: EventDetails, status: CardStatus, now: string): EventDetails {
  if (status === "cancelled" || status === "denied") {
    if (!e.tasks) return e;
    const { tasks: _dropped, ...rest } = e;
    return { ...rest, history: _dropped.length ? [...e.history, historyEntry("portal", now, "Team tasks dropped")] : e.history };
  }
  if (status !== "approved" || e.stage !== "approved") return e;
  const tasks = syncTasks(e.tasks, planTasks(e), now);
  const added = newlyUnlockedTeams(e.tasks, tasks);
  return { ...e, tasks, history: added.length ? [...e.history, historyEntry("portal", now, `Team tasks unlocked: ${teamList(added)}`)] : e.history };
}

/** The card with new event details and status; also sets the fields lists and search read. Used by every transition. */
export function withStage(card: EventCard, e0: EventDetails, now: string, directors: string[], status?: CardStatus): EventCard {
  const st = status ?? statusForStage(e0.stage);
  const e = withTasks(e0, st, now);
  const next: EventCard = { ...card, event: e, status: st, updatedAt: now };
  next.waitingOn = waitingOnFor(next, directors);
  next.title = e.title;
  next.committee = e.committeeName;
  next.eventDate = e.dates[0] ?? e.date;
  next.searchText = [e.description.slice(0, 300), e.setupNotes].join(" ");
  return next;
}

/** Dates of the event, without any it gave up. */
const liveDates = (input: EventInput, released: string[] = []) => eventDates(input.date, input.recur).filter((d) => !released.includes(d));

/** "Submitted as a series: Every Tuesday, Nov 3 to Jan 26". */
const submittedText = (input: EventInput) =>
  input.recur ? `Submitted as a series: ${recurText(input.date, input.recur)}, ${longDate(input.date)} to ${longDate(input.recur.until)}` : `Submitted for ${dayText(input.date)}`;

/** A new event card from checked form input. The store assigns the ID. */
export function newEvent(input: EventInput, owner: EventActor, now: string, checks: Check[]): EventCard {
  const e: EventDetails = {
    ...input,
    dates: liveDates(input),
    stage: "slot",
    stageSince: now,
    approvals: [],
    agreed: { name: owner.name, at: now },
    checks,
    holds: [],
    history: [],
  };
  return { id: "", orgId: ORG.id, type: "event", title: input.title, status: "submitted", ownerEmail: lc(owner.email), committee: input.committeeName, eventDate: e.dates[0], createdAt: now, updatedAt: now, event: e };
}

/** Route a new request: to review, or to wait on an ask for a booked time (SR-…). */
export function submit(card: EventCard, actor: EventActor, directors: string[], now: string, o: { waitingOnAsk?: string } = {}): EventCard {
  const stage = firstStage(card.ownerEmail, directors, o);
  const notes = stage === "mission" && !reviewersFor(card.ownerEmail, directors).length ? (directors.length ? "Requester is the committee's director, so it goes to the executive." : "The committee has no director, so it goes to the executive.") : undefined;
  const e: EventDetails = {
    ...card.event,
    stage,
    stageSince: now,
    waitingOnAsk: o.waitingOnAsk,
    history: [...card.event.history, historyEntry(actor.email, now, submittedText(card.event), notes)],
  };
  if (o.waitingOnAsk) e.history.push(historyEntry(actor.email, now, `Waiting for an answer to ${o.waitingOnAsk} before mission review`));
  return withStage(card, e, now, directors);
}

export function approve(card: EventCard, actor: EventActor, directors: string[], now: string, note?: string): EventCard {
  mustDo(card, actor, "approve", directors);
  const cur = card.event;
  const approval: EventApproval = { stage: cur.stage as "director" | "mission", by: lc(actor.email), at: now };
  // A moved event needs only the director.
  const stage: EventStage = cur.stage === "director" && !cur.releasedFor ? "mission" : "approved";
  const action = cur.stage === "director" ? "Approved as director" : "Approved (executive review)";
  const e: EventDetails = {
    ...cur,
    stage,
    stageSince: now,
    approvals: [...cur.approvals, approval],
    returnNote: undefined,
    releasedFor: stage === "approved" ? undefined : cur.releasedFor,
    history: [...cur.history, historyEntry(actor.email, now, action, note), ...(stage === "approved" && cur.rooms.length ? [historyEntry("portal", now, "Room hold confirmed on the IAR calendar")] : [])],
  };
  return withStage(card, e, now, directors);
}

export function returnForChanges(card: EventCard, actor: EventActor, directors: string[], now: string, note: string): EventCard {
  mustDo(card, actor, "return", directors);
  if (!note.trim()) throw new WorkflowError("Say what needs to change.");
  const e: EventDetails = {
    ...card.event,
    returnNote: note.trim(),
    history: [...card.event.history, historyEntry(actor.email, now, `Sent back for changes (${STAGE_LABEL[card.event.stage]})`, note.trim()), ...(card.event.rooms.length ? [historyEntry("portal", now, "Room hold taken off the calendar until it's resubmitted")] : [])],
  };
  return withStage(card, e, now, directors, "changes_requested");
}

export function deny(card: EventCard, actor: EventActor, directors: string[], now: string, note: string): EventCard {
  mustDo(card, actor, "deny", directors);
  if (!note.trim()) throw new WorkflowError("Give a reason for denying it.");
  const e: EventDetails = { ...card.event, returnNote: note.trim(), history: [...card.event.history, historyEntry(actor.email, now, `Denied (${STAGE_LABEL[card.event.stage]})`, note.trim())] };
  return withStage(card, e, now, directors, "denied");
}

export function cancel(card: EventCard, actor: EventActor, directors: string[], now: string): EventCard {
  mustDo(card, actor, "cancel", directors);
  const e: EventDetails = { ...card.event, history: [...card.event.history, historyEntry(actor.email, now, "Cancelled by the requester", card.event.rooms.length ? "Taken off the IAR calendar" : undefined)] };
  return withStage(card, e, now, directors, "cancelled");
}

/** The requester sends back an edited request; review starts over (or only the director, for a moved event). */
export function resubmit(card: EventCard, edited: EventInput, actor: EventActor, directors: string[], now: string, checks: Check[], o: { waitingOnAsk?: string } = {}): EventCard {
  mustDo(card, actor, "resubmit", directors);
  const released = card.event.releasedFor ? [] : card.event.released;
  const stage = firstStage(card.ownerEmail, directors, { waitingOnAsk: o.waitingOnAsk, releasedFor: card.event.releasedFor });
  const moved = Boolean(card.event.releasedFor);
  const e: EventDetails = {
    ...card.event,
    ...edited,
    dates: liveDates(edited, released),
    released,
    checks,
    stage,
    stageSince: now,
    approvals: [],
    returnNote: undefined,
    waitingOnAsk: o.waitingOnAsk,
    releasedFor: stage === "approved" ? undefined : card.event.releasedFor,
    history: [
      ...card.event.history,
      historyEntry(actor.email, now, moved ? "Moved to give up its time and resubmitted" : "Edited and resubmitted", moved ? (stage === "approved" ? "No director over this committee, so it's approved without executive review." : "Only the director needs to approve it.") : undefined),
    ],
  };
  return withStage(card, e, now, directors);
}

// ---- After an ask for a booked time (slot-requests.ts) --------------------

/** The holder gave the time up: the requester's card goes into mission review. */
export function slotGranted(card: EventCard, directors: string[], now: string, askId: string): EventCard {
  const stage = firstStage(card.ownerEmail, directors);
  const e: EventDetails = { ...card.event, stage, stageSince: now, waitingOnAsk: undefined, history: [...card.event.history, historyEntry("portal", now, `The time was given up (${askId}). Sent to mission review`)] };
  return withStage(card, e, now, directors);
}

/** The holder kept the time: back to the requester to pick another. */
export function slotRefused(card: EventCard, directors: string[], now: string, note: string): EventCard {
  const e: EventDetails = { ...card.event, waitingOnAsk: undefined, returnNote: note, history: [...card.event.history, historyEntry("portal", now, "The time was kept", note)] };
  return withStage(card, e, now, directors, "changes_requested");
}

/** The holder gives up dates and moves their event: they pick a new time, then only the director reviews it. */
export function releaseToMove(card: EventCard, directors: string[], now: string, askId: string, dates: string[]): EventCard {
  const released = [...new Set([...(card.event.released ?? []), ...dates])].sort();
  const e: EventDetails = {
    ...card.event,
    released,
    dates: card.event.dates.filter((d) => !dates.includes(d)),
    releasedFor: askId,
    returnNote: "Pick a new time. Only the director needs to approve it.",
    history: [...card.event.history, historyEntry("portal", now, `Gave up ${dates.length === 1 ? dayText(dates[0]) : `${dates.length} dates`} for ${askId}. Pick a new time`)],
  };
  return withStage(card, e, now, directors, "changes_requested");
}

/** The holder gives up some dates and cancels them; the rest of the series stays as it is. */
export function dropDates(card: EventCard, directors: string[], now: string, askId: string, dates: string[]): EventCard {
  const released = [...new Set([...(card.event.released ?? []), ...dates])].sort();
  const e: EventDetails = {
    ...card.event,
    released,
    dates: card.event.dates.filter((d) => !dates.includes(d)),
    history: [...card.event.history, historyEntry("portal", now, `Gave up ${dates.map(dayText).join(", ")} for ${askId}. Those dates are cancelled`)],
  };
  return withStage(card, e, now, directors, card.status);
}

/** The holder gives up their whole booking for an ask. */
export function cancelForAsk(card: EventCard, directors: string[], now: string, askId: string): EventCard {
  const e: EventDetails = { ...card.event, history: [...card.event.history, historyEntry("portal", now, `Gave up the whole booking for ${askId}. Cancelled and taken off the IAR calendar`)] };
  return withStage(card, e, now, directors, "cancelled");
}

// ---- Lists ----------------------------------------------------------------

/** Requests waiting on this person's review. */
export function reviewableBy(cards: EventCard[], actor: EventActor, directorsOf: (c: EventCard) => string[]): EventCard[] {
  return cards.filter((c) => permission(c, actor, "approve", directorsOf(c)).ok);
}

/** Approved events still to come, soonest first. */
export function upcoming(cards: EventCard[], today: string): EventCard[] {
  return cards
    .filter((c) => (c.status === "approved" || c.status === "in_review") && c.event.dates.some((d) => d >= today))
    .sort((a, b) => (a.event.dates.find((d) => d >= today) ?? "").localeCompare(b.event.dates.find((d) => d >= today) ?? ""));
}
