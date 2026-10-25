/**
 * Whether a request is waiting on the person looking, across every module,
 * and the "Needs you / Waiting on others / Done" grouping every list uses.
 * Plain functions: each module's own permission rules
 * decide who can act, so this never disagrees with the buttons on the page.
 */
import type { Card, CardStatus } from "./cards";
import { permission as eventPermission, type EventCard } from "./events/workflow";
import { permission as marketingPermission, type MarketingCard } from "./marketing/workflow";
import { openExpectedReturns } from "./purchases/types";
import { actionableBy, permission as purchasePermission, type Actor, type PurchaseCard } from "./purchases/workflow";
import { onTeam, type TicketCard } from "./tickets/workflow";
import type { Role } from "./org";
import { canDecide, type SlotActor, type SlotRequest } from "./events/slot-requests";
import { queueItems, type QueueItem } from "./events/queues";
import { TASK_TEAMS } from "./events/tasks";
import { same } from "./text";

/**
 * The person looking: their own group roles (never the admin "see everything"
 * expansion), plus what lib/people.ts `actorFor` adds for purchase approvals.
 */
export type NeedsViewer = Actor;

export type NeedsContext = {
  /** An event committee's directors (lib/events/context.ts `directorsOf`). Without it, nobody is a director. */
  directorsOf?: (committeeGroup: string) => string[];
};

/** Statuses where the requester has to do something (as `NEEDS_OWNER` in cards.ts). */
const OWNER_ACTS: CardStatus[] = ["draft", "changes_requested", "close_out"];
/** Statuses with nothing left to do for the requester. */
const FINISHED: CardStatus[] = ["paid", "closed", "denied", "cancelled"];

function purchaseNeeds(card: PurchaseCard, v: NeedsViewer): boolean {
  if (actionableBy([card], v).length) return true;
  // Finance records refunds and repayments still owed on a finished request.
  return openExpectedReturns(card.purchase).length > 0 && purchasePermission(card, v, "resolve").ok;
}

function eventNeeds(card: EventCard, v: NeedsViewer, ctx: NeedsContext): boolean {
  const directors = ctx.directorsOf?.(card.event.committeeGroup) ?? [];
  return eventPermission(card, v, "approve", directors).ok;
}

function marketingNeeds(card: MarketingCard, v: NeedsViewer): boolean {
  const m = card.marketing;
  if (marketingPermission(card, v, "schedule").ok) return true; // the weekly review, for the team
  return (m.stage === "scheduled" || m.stage === "doing") && same(m.assignee, v.email);
}

function ticketNeeds(card: TicketCard, v: NeedsViewer): boolean {
  const t = card.ticket;
  if (!onTeam(v, t.team)) return false;
  if (t.status === "new") return true;
  if (t.status === "assigned" || t.status === "in_progress" || t.status === "waiting_parts" || t.status === "reopened") return t.assigneeEmail ? same(t.assigneeEmail, v.email) : true;
  return false;
}

/** True when the request is waiting on this person: to fix, answer, approve, pay, pick up or confirm it. */
export function needsViewer(card: Card, viewer: NeedsViewer, ctx: NeedsContext = {}): boolean {
  if (same(card.ownerEmail, viewer.email) && OWNER_ACTS.includes(card.status)) return true;
  if (card.purchase) return purchaseNeeds(card as PurchaseCard, viewer);
  if (card.event) return eventNeeds(card as EventCard, viewer, ctx);
  if (card.marketing) return marketingNeeds(card as MarketingCard, viewer);
  if (card.ticket) return ticketNeeds(card as TicketCard, viewer);
  return false;
}

/** Finished from the requester's side: paid, closed, declined or withdrawn. */
export const isFinished = (card: Card) => FINISHED.includes(card.status);

export type Grouped<C extends Card = Card> = { needsYou: C[]; waiting: C[]; done: C[] };

/**
 * A list in three groups, newest activity first in each: what needs this
 * person, what's waiting on someone else, and what's done (shown folded).
 * Something that needs the person is never filed as done.
 */
export function groupForViewer<C extends Card>(cards: C[], viewer: NeedsViewer, ctx: NeedsContext = {}): Grouped<C> {
  const sorted = [...cards].sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : b.updatedAt < a.updatedAt ? -1 : 0));
  const out: Grouped<C> = { needsYou: [], waiting: [], done: [] };
  for (const c of sorted) {
    if (needsViewer(c, viewer, ctx)) out.needsYou.push(c);
    else if (isFinished(c)) out.done.push(c);
    else out.waiting.push(c);
  }
  return out;
}

// ---- Waiting on you outside a card's own steps -----------------------------------

/**
 * Asks for a booked time this person can answer (lib/events/slot-requests.ts).
 * An ask belongs to the event that holds the room, not the asker's card, so
 * it isn't part of needsViewer; the home page lists these next to it.
 */
export function slotAsksFor(asks: SlotRequest[], actor: SlotActor): SlotRequest[] {
  return asks.filter((r) => canDecide(r, actor)).sort((a, b) => a.askedAt.localeCompare(b.askedAt));
}

/**
 * Open event tasks for the teams this person is on (marketing, A/V, security),
 * soonest due first. Team tasks stay in Team Queues; this is for a count or a
 * short list that links there. The office sees every queue in Team Queues, but
 * those tasks aren't "waiting on you".
 */
export function teamTasksFor(cards: EventCard[], roles: Role[], today: string): QueueItem[] {
  return TASK_TEAMS.filter((t) => roles.includes(t))
    .flatMap((t) => queueItems(cards, t, today))
    .sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate) || a.card.id.localeCompare(b.card.id));
}
