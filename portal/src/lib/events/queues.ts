/**
 * Team Queues: each team's open tasks across every event card, soonest due
 * first, and for Marketing its scheduled and in-progress marketing requests
 * too. A person sees the queues of the teams they're on; the IAR office sees
 * them all. Plain functions so they can be tested.
 */
import type { Card } from "../cards";
import type { Role } from "../org";
import { TASK_TEAMS, planTasks } from "./tasks";
import type { EventTask, TaskTeam } from "./types";
import type { EventCard } from "./workflow";

export type QueueItem = { card: EventCard; task: EventTask; overdue: boolean };

/** The queues this person sees: their teams', or all of them for the office (and admins helping out). */
export function queueTeamsFor(roles: Role[], seeAll = false): TaskTeam[] {
  if (seeAll || roles.includes("office")) return [...TASK_TEAMS];
  return TASK_TEAMS.filter((t) => roles.includes(t));
}

const live = (c: EventCard) => c.status === "approved" || c.status === "close_out";

/** Open tasks (to do and in progress) for one team, soonest due first. */
export function queueItems(cards: EventCard[], team: TaskTeam, today: string): QueueItem[] {
  return cards
    .filter(live)
    .flatMap((card) => (card.event.tasks ?? []).filter((t) => t.team === team && (t.status === "todo" || t.status === "doing")).map((task) => ({ card, task, overdue: task.dueDate < today })))
    .sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate) || a.card.id.localeCompare(b.card.id) || a.task.id.localeCompare(b.task.id));
}

/**
 * What the queue shows by default: everything due by `horizon` (two weeks
 * out), plus the next task of every event, so a weekly series shows its next
 * date instead of all of them.
 */
export function nearTerm(items: QueueItem[], horizon: string): QueueItem[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    const first = !seen.has(x.card.id);
    seen.add(x.card.id);
    return first || x.task.dueDate <= horizon;
  });
}

/** The team's most recently finished tasks. */
export function recentlyDone(cards: EventCard[], team: TaskTeam, limit = 10): QueueItem[] {
  const at = (t: EventTask) => t.history[t.history.length - 1]?.at ?? "";
  return cards
    .flatMap((card) => (card.event.tasks ?? []).filter((t) => t.team === team && t.status === "done").map((task) => ({ card, task, overdue: false })))
    .sort((a, b) => at(b.task).localeCompare(at(a.task)))
    .slice(0, limit);
}

/** Tasks the team will get once events now in review are approved. */
export function lockedCount(cards: EventCard[], team: TaskTeam): number {
  return cards.filter((c) => c.status === "submitted" || c.status === "in_review").reduce((n, c) => n + planTasks(c.event, "locked").filter((t) => t.team === team).length, 0);
}

/** Marketing's other work: requests that are scheduled or in progress, soonest done-by date first. */
export function marketingQueue(cards: Card[]): Card[] {
  return cards
    .filter((c) => c.type === "marketing" && (c.marketing?.stage === "scheduled" || c.marketing?.stage === "doing"))
    .sort((a, b) => (a.marketing?.doneBy ?? "9999").localeCompare(b.marketing?.doneBy ?? "9999") || a.id.localeCompare(b.id));
}
