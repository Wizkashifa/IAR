/**
 * The marketing team's Team work list: requests and event tasks together.
 * Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { QueueItem } from "../events/queues";
import type { EventTask } from "../events/types";
import type { EventCard } from "../events/workflow";
import { FEED_FILTERS, feedFilter, marketingFeed, type FeedItem } from "./feed";
import type { MarketingCard } from "./workflow";

const ME = "mk@x.org";
const req = (id: string, stage: string, updatedAt: string, assignee?: string) =>
  ({ id, type: "marketing", status: "submitted", updatedAt, marketing: { stage, assignee } }) as unknown as MarketingCard;
const task = (id: string, status: EventTask["status"], at: string, assignee?: string): QueueItem => ({
  card: { id, updatedAt: "2026-10-01T10:00:00Z" } as unknown as EventCard,
  task: { id: "marketing", team: "marketing", title: "Flyer", status, dueDate: "2026-11-14", assignee, history: [{ by: "portal", at, action: "Unlocked" }] },
  overdue: false,
});
const ids = (xs: FeedItem[]) => xs.map((x) => (x.kind === "request" ? x.card.id : x.item.card.id));

const items = marketingFeed(
  [req("MK-1", "review", "2026-10-20T10:00:00Z"), req("MK-2", "doing", "2026-10-22T10:00:00Z", ME), req("MK-3", "question", "2026-10-19T10:00:00Z"), req("MK-4", "scheduled", "2026-10-18T10:00:00Z", "other@x.org")],
  [task("EV-1", "todo", "2026-10-21T10:00:00Z"), task("EV-2", "doing", "2026-10-17T10:00:00Z", "other@x.org")],
);
const only = (id: string) => ids(items.filter((x) => feedFilter(id).test(x, ME)));

test("feed: requests in every open stage and event tasks, newest activity first", () => {
  assert.deepEqual(ids(items), ["MK-2", "EV-1", "MK-1", "MK-3", "MK-4", "EV-2"]);
});

test("feed: each filter", () => {
  assert.deepEqual(FEED_FILTERS.map((f) => f.id), ["all", "new", "unassigned", "mine", "scheduled", "doing", "waiting"]);
  assert.deepEqual(only("all"), ids(items));
  assert.deepEqual(only("new"), ["EV-1", "MK-1"], "new requests, and event tasks nobody has taken");
  assert.deepEqual(only("unassigned"), ["EV-1", "MK-1"], "waiting on the requester isn't the team's to pick up");
  assert.deepEqual(only("mine"), ["MK-2"], "someone else's work isn't mine");
  assert.deepEqual(only("scheduled"), ["MK-4"]);
  assert.deepEqual(only("doing"), ["MK-2", "EV-2"]);
  assert.deepEqual(only("waiting"), ["MK-3"]);
  assert.equal(feedFilter("nonsense").id, "all");
});
