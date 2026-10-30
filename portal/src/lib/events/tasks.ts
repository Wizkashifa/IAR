/**
 * Team tasks on older event cards (docs/plan.md, "The event card"). Events
 * no longer get tasks: marketing for an event is a marketing request linked
 * to it (lib/marketing/linked.ts), and its A/V is a ticket per date for IT
 * (lib/tickets/event-av.ts). Events approved before that keep their
 * Marketing and A/V tasks until the team finishes them: the team takes,
 * starts, finishes or hands them over here. A/V no longer asked for drops
 * the A/V task; cancelling the event drops them all. Tasks for teams that
 * no longer get them (Security's) are never shown, counted or worked.
 * Plain functions so they can be tested.
 */
import { withComment } from "../comments";
import type { Role } from "../org";
import type { Notice } from "../notices";
import { dayText } from "./series";
import type { EventDetails, EventTask, TaskStatus, TaskTeam } from "./types";
import type { EventActor, EventCard } from "./workflow";
import { lc } from "../text";
import { historyEntry } from "../workflow-core";

export const TASK_TEAMS: TaskTeam[] = ["marketing", "av"];

export const TEAM_NAME: Record<TaskTeam, string> = { marketing: "Marketing", av: "A/V" };

/** Where each team works its event tasks. */
export const TEAM_WORK_HREF: Record<TaskTeam, string> = { marketing: "/marketing?view=team", av: "/it-maintenance?view=team" };

/** A task for a team that still gets tasks (not one left from a team that no longer does). */
export const isTeamTask = (t: EventTask) => (TASK_TEAMS as string[]).includes(t.team);

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { locked: "Unlocks on approval", todo: "To do", doing: "In progress", done: "Done" };

export class TaskError extends Error {}

const short = (s: string, max = 70) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * The card's tasks after an approval: the older tasks it still has keep
 * their status, assignee and history; the A/V task goes once A/V isn't asked
 * for, and tasks for teams that no longer get them go.
 */
export function keptTasks(e: EventDetails): EventTask[] {
  return (e.tasks ?? []).filter((t) => isTeamTask(t) && (t.team !== "av" || e.av)).map((t) => ({ ...t, status: t.status === "locked" ? ("todo" as const) : t.status }));
}

/** What the card shows: its tasks, if it's an older event that has some. */
export function tasksFor(card: EventCard): EventTask[] {
  return (card.event.tasks ?? []).filter(isTeamTask);
}

// ---- Working on a task -----------------------------------------------------

export type TaskAction = "take" | "start" | "done" | "ask" | "assign";

/** A team's members work its tasks; the IAR office can work any of them. */
export const worksTeam = (team: TaskTeam, roles: Role[]) => roles.includes(team) || roles.includes("office");

/** Whether the task can be worked on now: the event is approved (or in close-out) and it isn't locked. */
export function taskPermission(card: EventCard, taskId: string, actor: EventActor, action: TaskAction): { ok: true; task: EventTask } | { ok: false; reason: string } {
  const task = card.event.tasks?.find((t) => t.id === taskId && isTeamTask(t));
  if (!task) return { ok: false, reason: card.event.tasks?.length ? "That task isn't on this event any more." : "This event's tasks unlock when it's approved." };
  if (!worksTeam(task.team, actor.roles)) return { ok: false, reason: `Only the ${TEAM_NAME[task.team]} team can work on this task.` };
  if (card.status !== "approved" && card.status !== "close_out") return { ok: false, reason: "This event isn't approved, so its tasks are on hold." };
  if (task.status === "locked") return { ok: false, reason: "This task unlocks when the event is approved." };
  if (action === "ask") return { ok: true, task };
  if (task.status === "done") return { ok: false, reason: "This task is already done." };
  if (action === "take" && task.assignee && lc(task.assignee) !== lc(actor.email)) return { ok: false, reason: `${task.assignee} already took this task.` };
  if (action === "take" && task.assignee) return { ok: false, reason: "You already have this task." };
  if (action === "assign") return { ok: true, task };
  if (action === "start" && task.status === "doing") return { ok: false, reason: "This task is already in progress." };
  return { ok: true, task };
}

/** The card with one task changed, written to the task's and the event's history. */
function withTask(card: EventCard, task: EventTask, now: string, by: string, action: string, note?: string): EventCard {
  const t: EventTask = { ...task, history: [...task.history, historyEntry(by, now, action, note)] };
  const tasks = (card.event.tasks ?? []).map((x) => (x.id === t.id ? t : x));
  const history = [...card.event.history, historyEntry(by, now, `${TEAM_NAME[t.team]} task: ${action.charAt(0).toLowerCase()}${action.slice(1)} (${t.title})`, note)];
  return { ...card, event: { ...card.event, tasks, history }, updatedAt: now };
}

/**
 * Take it (assign it to me), start it, mark it done (with an optional note),
 * or send the requester a question (a comment on the event; the caller sends
 * the alert, see taskNotices).
 */
export function actOnTask(card: EventCard, taskId: string, actor: EventActor & { name?: string }, action: TaskAction, now: string, note = ""): EventCard {
  const p = taskPermission(card, taskId, actor, action);
  if (!p.ok) throw new TaskError(p.reason);
  const task = p.task;
  const text = note.trim().slice(0, 1000);
  switch (action) {
    case "take":
      return withTask(card, { ...task, assignee: lc(actor.email) }, now, actor.email, "Taken");
    case "start":
      return withTask(card, { ...task, status: "doing", assignee: task.assignee ?? lc(actor.email) }, now, actor.email, "Started", text || undefined);
    case "done":
      return withTask(card, { ...task, status: "done", assignee: task.assignee ?? lc(actor.email), ...(text ? { note: text } : {}) }, now, actor.email, "Done", text || undefined);
    case "ask": {
      if (!text) throw new TaskError("Write your question for the requester.");
      const asked = withTask(card, task, now, actor.email, "Question for the requester", text);
      return withComment(asked, { at: now, by: actor.email, name: actor.name ?? actor.email, text: `${TEAM_NAME[task.team]} question (${task.title}): ${text}` });
    }
    case "assign":
      throw new TaskError("Choose who should have it.");
  }
}

/**
 * Hand a task to someone on its team (or take it yourself). `members`:
 * everyone in the team's Google Group, by email. Its status doesn't change.
 */
export function assignTask(card: EventCard, taskId: string, actor: EventActor, to: string, members: string[], now: string): EventCard {
  const p = taskPermission(card, taskId, actor, "assign");
  if (!p.ok) throw new TaskError(p.reason);
  const task = p.task;
  const email = lc(to.trim());
  if (!email) throw new TaskError("Choose who should have it.");
  if (!members.some((m) => lc(m) === email)) throw new TaskError(`${email} isn't on the ${TEAM_NAME[task.team]} team's Google Group.`);
  if (task.assignee && lc(task.assignee) === email) throw new TaskError(`${lc(actor.email) === email ? "You already have" : `${email} already has`} this task.`);
  const self = lc(actor.email) === email;
  const action = task.assignee ? `Handed from ${task.assignee} to ${self ? "themselves" : email}` : self ? "Taken" : `Assigned to ${email}`;
  return withTask(card, { ...task, assignee: email }, now, actor.email, action);
}

/**
 * Who hears about a task change: the requester when it's done (in the portal),
 * and when the team asks them something (an alert: they have to answer); a
 * teammate when it's handed to them (an alert).
 */
export function taskNotices(after: EventCard, taskId: string, actor: EventActor, action: TaskAction, note = ""): Notice[] {
  const task = after.event.tasks?.find((t) => t.id === taskId);
  const what = `${after.id} “${after.title}”`;
  // Handed to someone else on the team: they hear about it, with an alert (it's theirs to do now).
  if (action === "assign") {
    if (!task?.assignee || lc(task.assignee) === lc(actor.email)) return [];
    return [{ to: { email: task.assignee }, cardId: after.id, href: `/events/${after.id}#tasks`, text: `${what}: ${actor.name || actor.email} handed you the ${TEAM_NAME[task.team]} task “${task.title}”. Due ${dayText(task.dueDate)}.`, alert: true, delegable: false }];
  }
  if (!task || lc(after.ownerEmail) === lc(actor.email)) return [];
  if (action === "done") {
    return [{ to: { email: after.ownerEmail }, cardId: after.id, href: `/events/${after.id}#tasks`, text: `${what}: ${TEAM_NAME[task.team]} finished “${task.title}”.${note.trim() ? ` Note: ${short(note, 140)}` : ""}`, alert: false, delegable: false }];
  }
  if (action === "ask") {
    return [{ to: { email: after.ownerEmail }, cardId: after.id, href: `/events/${after.id}#comments`, text: `${what}: ${TEAM_NAME[task.team]} has a question about “${task.title}”: “${short(note, 140)}” Answer in a comment on the event.`, alert: true, delegable: false }];
  }
  return [];
}
