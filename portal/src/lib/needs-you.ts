/**
 * Whether a request is waiting on the person looking, across every module,
 * and the "Needs you / Waiting on others / Done" grouping every list uses.
 * Plain functions: each module's own permission rules
 * decide who can act, so this never disagrees with the buttons on the page.
 */
import type { Card, CardStatus } from "./cards";
import type { EventCard } from "./events/workflow";
import type { Actor } from "./purchases/workflow";
import { moduleFor } from "./registry";
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

/** True when the request is waiting on this person: to fix, answer, approve, pay, pick up or confirm it. */
export function needsViewer(card: Card, viewer: NeedsViewer, ctx: NeedsContext = {}): boolean {
  if (same(card.ownerEmail, viewer.email) && OWNER_ACTS.includes(card.status)) return true;
  return moduleFor(card)?.needs(card, viewer, ctx) ?? false;
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
 * Open event tasks for the teams this person is on (marketing, A/V),
 * soonest due first. Team tasks stay on each team's page (IT & Maintenance for
 * A/V, Marketing Requests for marketing); this is for a count or a short list
 * that links there. The office can work every task, but those tasks aren't
 * "waiting on you".
 */
export function teamTasksFor(cards: EventCard[], roles: Role[], today: string): QueueItem[] {
  return TASK_TEAMS.filter((t) => roles.includes(t))
    .flatMap((t) => queueItems(cards, t, today))
    .sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate) || a.card.id.localeCompare(b.card.id));
}
