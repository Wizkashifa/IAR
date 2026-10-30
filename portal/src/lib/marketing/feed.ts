/**
 * The marketing team's work in one list (Marketing Requests → Team work):
 * every open marketing request (pieces for an event among them, with their
 * event), and the Marketing task still open on older approved events, newest
 * activity first. Anyone on the team picks up a new request as
 * it comes in; the filters narrow the list. Plain functions so they can be
 * tested.
 */
import type { QueueItem } from "../events/queues";
import { same } from "../text";
import type { MarketingCard } from "./workflow";

/** The event a piece of marketing is for, as its row and the "By event" groups show it. */
export type FeedEvent = { id: string; title: string; date: string; approved: boolean };

export type FeedItem = { kind: "request"; card: MarketingCard; at: string; event?: FeedEvent } | { kind: "task"; item: QueueItem; at: string };

/** When something last happened: the request's last change, or the task's last step. */
const taskAt = (q: QueueItem) => q.task.history.at(-1)?.at ?? q.card.updatedAt;

/**
 * Open requests and open event tasks together, newest activity first.
 * `events`: the events pieces are linked to, by ID, so each piece's row can
 * name its event.
 */
export function marketingFeed(requests: MarketingCard[], tasks: QueueItem[], events: Map<string, FeedEvent> = new Map()): FeedItem[] {
  const items: FeedItem[] = [
    ...requests.map((card) => {
      const event = card.marketing.eventCardId ? events.get(card.marketing.eventCardId) : undefined;
      return { kind: "request" as const, card, at: card.updatedAt, ...(event ? { event } : {}) };
    }),
    ...tasks.map((item) => ({ kind: "task" as const, item, at: taskAt(item) })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at) || idOf(a).localeCompare(idOf(b)));
}

/** The event an item is for: a piece's event, or the event an older Marketing task is on. */
export function eventOf(x: FeedItem): FeedEvent | undefined {
  if (x.kind === "request") return x.event;
  const c = x.item.card;
  return { id: c.id, title: c.title, date: c.event.dates[0] ?? c.event.date, approved: true };
}

/**
 * "By event": one group per event, soonest event first, each with its
 * pieces newest first (Eid Fest's eight pieces read as one). Items that
 * aren't for an event are left out.
 */
export function byEvent(items: FeedItem[]): { event: FeedEvent; items: FeedItem[] }[] {
  const groups = new Map<string, { event: FeedEvent; items: FeedItem[] }>();
  for (const x of items) {
    const e = eventOf(x);
    if (!e) continue;
    const g = groups.get(e.id) ?? { event: e, items: [] };
    g.items.push(x);
    groups.set(e.id, g);
  }
  return [...groups.values()].sort((a, b) => a.event.date.localeCompare(b.event.date) || a.event.id.localeCompare(b.event.id));
}

const idOf = (x: FeedItem) => (x.kind === "request" ? x.card.id : `${x.item.card.id}-${x.item.task.id}`);

/** Who on the team has it, if anyone. */
const assigneeOf = (x: FeedItem) => (x.kind === "request" ? x.card.marketing.assignee : x.item.task.assignee);

/** With the requester (a question to answer or a draft to approve), so not the team's to pick up. */
const withRequester = (x: FeedItem) => x.kind === "request" && (x.card.marketing.stage === "question" || x.card.marketing.stage === "proof");

export type FeedFilter ={ id: string; label: string; test: (x: FeedItem, me: string) => boolean };

/** The filters above the list, in order. */
export const FEED_FILTERS: FeedFilter[] = [
  { id: "all", label: "All open", test: () => true },
  { id: "new", label: "New", test: (x) => (x.kind === "request" ? x.card.marketing.stage === "review" : x.item.task.status === "todo" && !x.item.task.assignee) },
  { id: "unassigned", label: "Nobody has it", test: (x) => !assigneeOf(x) && !withRequester(x) },
  { id: "mine", label: "Mine", test: (x, me) => same(assigneeOf(x), me) },
  { id: "scheduled", label: "Scheduled", test: (x) => (x.kind === "request" ? x.card.marketing.stage === "scheduled" : x.item.task.status === "todo" && Boolean(x.item.task.assignee)) },
  // Approved work is still the team's to send out, so it's in progress too.
  { id: "doing", label: "In progress", test: (x) => (x.kind === "request" ? x.card.marketing.stage === "doing" || x.card.marketing.stage === "ready" : x.item.task.status === "doing") },
  { id: "approval", label: "Waiting on approval", test: (x) => x.kind === "request" && x.card.marketing.stage === "proof" },
  { id: "waiting", label: "Waiting on the requester", test: (x) => x.kind === "request" && x.card.marketing.stage === "question" },
  { id: "event", label: "By event", test: (x) => Boolean(eventOf(x)) },
];

export const feedFilter = (id: string | undefined) => FEED_FILTERS.find((f) => f.id === id) ?? FEED_FILTERS[0];
