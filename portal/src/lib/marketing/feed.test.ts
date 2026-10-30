/**
 * The marketing team's Team work list: requests and event tasks together.
 * Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { QueueItem } from "../events/queues";
import type { EventTask } from "../events/types";
import type { EventCard } from "../events/workflow";
import { FEED_FILTERS, byEvent, eventOf, feedFilter, marketingFeed, type FeedEvent, type FeedItem } from "./feed";
import type { MarketingCard } from "./workflow";

const ME = "mk@x.org";
const req = (id: string, stage: string, updatedAt: string, assignee?: string, eventCardId?: string) =>
  ({ id, type: "marketing", status: "submitted", updatedAt, marketing: { stage, assignee, eventCardId } }) as unknown as MarketingCard;
const task = (id: string, status: EventTask["status"], at: string, assignee?: string): QueueItem => ({
  card: { id, title: `Event ${id}`, updatedAt: "2026-10-01T10:00:00Z", event: { date: "2026-11-14", dates: ["2026-11-14"] } } as unknown as EventCard,
  task: { id: "marketing", team: "marketing", title: "Flyer", status, dueDate: "2026-11-14", assignee, history: [{ by: "portal", at, action: "Unlocked" }] },
  overdue: false,
});
const ids = (xs: FeedItem[]) => xs.map((x) => (x.kind === "request" ? x.card.id : x.item.card.id));

const items = marketingFeed(
  [
    req("MK-1", "review", "2026-10-20T10:00:00Z"),
    req("MK-2", "doing", "2026-10-22T10:00:00Z", ME),
    req("MK-3", "question", "2026-10-19T10:00:00Z"),
    req("MK-4", "scheduled", "2026-10-18T10:00:00Z", "other@x.org"),
    req("MK-5", "proof", "2026-10-16T10:00:00Z", ME),
    req("MK-6", "ready", "2026-10-15T10:00:00Z", "other@x.org"),
    req("MK-7", "proof", "2026-10-14T10:00:00Z"),
  ],
  [task("EV-1", "todo", "2026-10-21T10:00:00Z"), task("EV-2", "doing", "2026-10-17T10:00:00Z", "other@x.org")],
);
const only = (id: string) => ids(items.filter((x) => feedFilter(id).test(x, ME)));

test("feed: requests in every open stage and event tasks, newest activity first", () => {
  assert.deepEqual(ids(items), ["MK-2", "EV-1", "MK-1", "MK-3", "MK-4", "EV-2", "MK-5", "MK-6", "MK-7"]);
});

test("feed: each filter", () => {
  assert.deepEqual(FEED_FILTERS.map((f) => f.id), ["all", "new", "unassigned", "mine", "scheduled", "doing", "approval", "waiting"]);
  assert.deepEqual(only("all"), ids(items));
  assert.deepEqual(only("new"), ["EV-1", "MK-1"], "new requests, and event tasks nobody has taken");
  assert.deepEqual(only("unassigned"), ["EV-1", "MK-1"], "waiting on the requester (a question or a draft) isn't the team's to pick up");
  assert.deepEqual(only("mine"), ["MK-2", "MK-5"], "someone else's work isn't mine");
  assert.deepEqual(only("scheduled"), ["MK-4"]);
  assert.deepEqual(only("doing"), ["MK-2", "EV-2", "MK-6"], "approved work still to send out is in progress");
  assert.deepEqual(only("approval"), ["MK-5", "MK-7"]);
  assert.deepEqual(only("waiting"), ["MK-3"]);
  assert.deepEqual(items.filter((x) => eventOf(x)).map((x) => (x.kind === "task" ? x.item.card.id : x.card.id)), ["EV-1", "EV-2"], "an older event's Marketing task is for its event");
  assert.equal(feedFilter("nonsense").id, "all");
});

test("feed: pieces carry their event; By event groups each event's pieces, soonest event first, newest piece first", () => {
  const events = new Map<string, FeedEvent>([
    ["EV-10", { id: "EV-10", title: "Eid Fest", date: "2026-12-01", approved: true }],
    ["EV-11", { id: "EV-11", title: "Fall Dinner", date: "2026-11-20", approved: false }],
  ]);
  const feed = marketingFeed(
    [
      req("MK-10", "review", "2026-10-20T10:00:00Z", undefined, "EV-10"),
      req("MK-11", "doing", "2026-10-22T10:00:00Z", ME, "EV-11"),
      req("MK-12", "review", "2026-10-23T10:00:00Z", undefined, "EV-10"),
      req("MK-13", "review", "2026-10-24T10:00:00Z"),
      req("MK-14", "review", "2026-10-25T10:00:00Z", undefined, "EV-gone"),
    ],
    [task("EV-1", "todo", "2026-10-21T10:00:00Z")],
    events,
  );
  const piece = feed.find((x) => x.kind === "request" && x.card.id === "MK-11");
  assert.deepEqual(piece && eventOf(piece), { id: "EV-11", title: "Fall Dinner", date: "2026-11-20", approved: false });
  assert.equal(eventOf(feed.find((x) => x.kind === "request" && x.card.id === "MK-13")!), undefined, "a request that isn't for an event");
  assert.equal(eventOf(feed.find((x) => x.kind === "request" && x.card.id === "MK-14")!), undefined, "an event that can't be read");
  const groups = byEvent(feed.filter((x) => feedFilter("event").test(x, ME)));
  assert.deepEqual(groups.map((g) => [g.event.id, ids(g.items)]), [
    ["EV-1", ["EV-1"]],
    ["EV-11", ["MK-11"]],
    ["EV-10", ["MK-12", "MK-10"]],
  ]);
});
