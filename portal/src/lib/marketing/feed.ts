/**
 * The marketing team's work in one list (Marketing Requests → Team work):
 * every open marketing request, and the Marketing task on each approved
 * event, newest activity first. Anyone on the team picks up a new request as
 * it comes in; the filters narrow the list. Plain functions so they can be
 * tested.
 */
import type { QueueItem } from "../events/queues";
import { same } from "../text";
import type { MarketingCard } from "./workflow";

export type FeedItem = { kind: "request"; card: MarketingCard; at: string } | { kind: "task"; item: QueueItem; at: string };

/** When something last happened: the request's last change, or the task's last step. */
const taskAt = (q: QueueItem) => q.task.history.at(-1)?.at ?? q.card.updatedAt;

/** Open requests and open event tasks together, newest activity first. */
export function marketingFeed(requests: MarketingCard[], tasks: QueueItem[]): FeedItem[] {
  const items: FeedItem[] = [
    ...requests.map((card) => ({ kind: "request" as const, card, at: card.updatedAt })),
    ...tasks.map((item) => ({ kind: "task" as const, item, at: taskAt(item) })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at) || idOf(a).localeCompare(idOf(b)));
}

const idOf = (x: FeedItem) => (x.kind === "request" ? x.card.id : `${x.item.card.id}-${x.item.task.id}`);

/** Who on the team has it, if anyone. */
const assigneeOf = (x: FeedItem) => (x.kind === "request" ? x.card.marketing.assignee : x.item.task.assignee);

export type FeedFilter = { id: string; label: string; test: (x: FeedItem, me: string) => boolean };

/** The filters above the list, in order. */
export const FEED_FILTERS: FeedFilter[] = [
  { id: "all", label: "All open", test: () => true },
  { id: "new", label: "New", test: (x) => (x.kind === "request" ? x.card.marketing.stage === "review" : x.item.task.status === "todo" && !x.item.task.assignee) },
  { id: "unassigned", label: "Nobody has it", test: (x) => !assigneeOf(x) && !(x.kind === "request" && x.card.marketing.stage === "question") },
  { id: "mine", label: "Mine", test: (x, me) => same(assigneeOf(x), me) },
  { id: "scheduled", label: "Scheduled", test: (x) => (x.kind === "request" ? x.card.marketing.stage === "scheduled" : x.item.task.status === "todo" && Boolean(x.item.task.assignee)) },
  { id: "doing", label: "In progress", test: (x) => (x.kind === "request" ? x.card.marketing.stage === "doing" : x.item.task.status === "doing") },
  { id: "waiting", label: "Waiting on the requester", test: (x) => x.kind === "request" && x.card.marketing.stage === "question" },
];

export const feedFilter = (id: string | undefined) => FEED_FILTERS.find((f) => f.id === id) ?? FEED_FILTERS[0];
