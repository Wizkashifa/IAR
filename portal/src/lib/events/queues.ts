/**
 * Each team's event tasks across every event card, soonest due first. A/V
 * works them from IT & Maintenance → Team tickets; Marketing from Marketing
 * Requests → Team work (lib/marketing/feed.ts). Team Queues (/queues) is
 * retired, and its old links go to those pages. Plain functions so they can
 * be tested.
 */
import type { Role } from "../org";
import { TEAM_WORK_HREF, planTasks } from "./tasks";
import type { EventTask, TaskTeam } from "./types";
import type { EventCard } from "./workflow";

export type QueueItem = { card: EventCard; task: EventTask; overdue: boolean };

/**
 * Where an old Team Queues link goes: to the team it names, or else to the
 * team this person is on. Marketing goes to Marketing Requests; A/V, the
 * office and everyone else to IT & Maintenance.
 */
export function retiredQueueHref(team: string | undefined, roles: Role[]): string {
  if (team === "marketing" || team === "av") return TEAM_WORK_HREF[team];
  const marketingOnly = roles.includes("marketing") && !roles.includes("av") && !roles.includes("office");
  return TEAM_WORK_HREF[marketingOnly ? "marketing" : "av"];
}

const live = (c: EventCard) => c.status === "approved" || c.status === "close_out";

/** Open tasks (to do and in progress) for one team, soonest due first. */
export function queueItems(cards: EventCard[], team: TaskTeam, today: string): QueueItem[] {
  return cards
    .filter(live)
    .flatMap((card) => (card.event.tasks ?? []).filter((t) => t.team === team && (t.status === "todo" || t.status === "doing")).map((task) => ({ card, task, overdue: task.dueDate < today })))
    .sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate) || a.card.id.localeCompare(b.card.id) || a.task.id.localeCompare(b.task.id));
}

/** When something last happened on the task: its last step, or the event's last change. */
export const taskAt = (q: Pick<QueueItem, "card" | "task">) => q.task.history.at(-1)?.at ?? q.card.updatedAt;

/** The team's most recently finished tasks. */
export function recentlyDone(cards: EventCard[], team: TaskTeam, limit = 10): QueueItem[] {
  return cards
    .flatMap((card) => (card.event.tasks ?? []).filter((t) => t.team === team && t.status === "done").map((task) => ({ card, task, overdue: false })))
    .sort((a, b) => taskAt(b).localeCompare(taskAt(a)))
    .slice(0, limit);
}

/** Tasks the team will get once events now in review are approved. */
export function lockedCount(cards: EventCard[], team: TaskTeam): number {
  return cards.filter((c) => c.status === "submitted" || c.status === "in_review").reduce((n, c) => n + planTasks(c.event, "locked").filter((t) => t.team === team).length, 0);
}
