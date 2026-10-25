/**
 * Team tasks on an event card (docs/plan.md, "The event card"). When an
 * event is approved it gets a task for each team it needs:
 * - Marketing, for a public event: flyer, announcement and website listing,
 *   due the day marketing should start.
 * - A/V, when A/V support was asked for: the kinds asked for, due on the day.
 * - Facilities, when the requester wrote a setup plan (tables, chairs, stage).
 * - Security, when it has a room: the room check before and after, plus
 *   after-hours coverage when it runs before 7 AM or past 10 PM. A series gets
 *   one security task per date; the other teams get one task for the series.
 * Before approval the tasks are shown as locked ("Unlocks on approval").
 * Cancelling the event drops them. Plain functions so they can be tested.
 */
import { withComment } from "../comments";
import type { Role } from "../org";
import type { Notice } from "../notices";
import { AV_KINDS } from "./input";
import { isAfterHours } from "./rules";
import { dayText } from "./series";
import type { EventDetails, EventTask, TaskStatus, TaskTeam } from "./types";
import type { EventActor, EventCard } from "./workflow";
import { lc } from "../text";
import { historyEntry } from "../workflow-core";

export const TASK_TEAMS: TaskTeam[] = ["marketing", "av", "security"];

export const TEAM_NAME: Record<TaskTeam, string> = { marketing: "Marketing", av: "A/V", security: "Security" };

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { locked: "Unlocks on approval", todo: "To do", doing: "In progress", done: "Done" };

export class TaskError extends Error {}

const short = (s: string, max = 70) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** The tasks this event needs, all with the given status. */
export function planTasks(e: EventDetails, status: TaskStatus = "todo"): EventTask[] {
  const first = e.dates[0] ?? e.date;
  const out: EventTask[] = [];
  const add = (t: Omit<EventTask, "status" | "history">) => out.push({ ...t, status, history: [] });
  if (e.isPublic) {
    add({
      id: "marketing",
      team: "marketing",
      title: `Flyer, announcement and website listing${e.brief?.subtitle ? `: “${e.brief.subtitle}”` : ""}`,
      dueDate: e.brief?.startOn && e.brief.startOn <= first ? e.brief.startOn : first,
    });
  }
  if (e.av) {
    const kinds = (e.avNeeds?.kinds ?? []).map((k) => (AV_KINDS[k] ?? k).toLowerCase());
    add({ id: "av", team: "av", title: `A/V: ${kinds.length ? kinds.join(", ") : "support requested"}`, dueDate: first });
  }
  if (e.rooms.length) {
    const title = `Room check before and after${isAfterHours(e) ? " + after-hours coverage" : ""}`;
    for (const d of e.dates) add({ id: `security-${d}`, team: "security", title: e.dates.length > 1 ? `${title} (${dayText(d)})` : title, dueDate: d, date: d });
  }
  return out;
}

/**
 * The card's tasks after approval: tasks it already had keep their status,
 * assignee and history; new ones are added as "to do"; ones it no longer
 * needs (a date given up, A/V no longer asked for) are dropped.
 */
export function syncTasks(existing: EventTask[] | undefined, planned: EventTask[], now: string): EventTask[] {
  const have = new Map((existing ?? []).map((t) => [t.id, t]));
  return planned.map((p) => {
    const t = have.get(p.id);
    if (t) return { ...t, title: p.title, dueDate: p.dueDate, ...(p.date ? { date: p.date } : {}), status: t.status === "locked" ? "todo" : t.status };
    return { ...p, status: "todo", history: [historyEntry("portal", now, "Unlocked when the event was approved")] };
  });
}

/** Teams with tasks now that had none before: they hear about the event once. */
export function newlyUnlockedTeams(before: EventTask[] | undefined, after: EventTask[] | undefined): TaskTeam[] {
  const had = new Set((before ?? []).filter((t) => t.status !== "locked").map((t) => t.team));
  return TASK_TEAMS.filter((team) => !had.has(team) && (after ?? []).some((t) => t.team === team && t.status !== "locked"));
}

/** What the card shows: its tasks once approved, or the tasks it will get (locked) while in review. */
export function tasksFor(card: EventCard): EventTask[] {
  if (card.event.tasks?.length) return card.event.tasks;
  if (card.status === "submitted" || card.status === "in_review" || card.status === "changes_requested") return planTasks(card.event, "locked");
  return [];
}

/** "Marketing, A/V and Security". */
export const teamList = (teams: TaskTeam[]) => teams.map((t) => TEAM_NAME[t]).join(", ").replace(/, ([^,]*)$/, " and $1");

/** Each team whose tasks just unlocked gets one alert in its Chat space, for the whole event. */
export function taskUnlockNotices(before: EventCard | null, after: EventCard): Notice[] {
  const out: Notice[] = [];
  for (const team of newlyUnlockedTeams(before?.event.tasks, after.event.tasks)) {
    const mine = (after.event.tasks ?? []).filter((t) => t.team === team);
    const first = mine.reduce((a, b) => (b.dueDate < a.dueDate ? b : a));
    const more = mine.length > 1 ? ` (${mine.length} tasks, one per date)` : "";
    out.push({
      to: { role: team },
      cardId: after.id,
      href: `/queues?team=${team}`,
      text: `${after.id} “${after.title}” is approved. New ${TEAM_NAME[team]} task: ${first.title}${more}. First one due ${dayText(first.dueDate)}.`,
      alert: true,
      delegable: false,
    });
  }
  return out;
}

// ---- Working on a task -----------------------------------------------------

export type TaskAction = "take" | "start" | "done" | "ask";

/** A team's members work its tasks; the IAR office can work any of them. */
export const worksTeam = (team: TaskTeam, roles: Role[]) => roles.includes(team) || roles.includes("office");

/** Whether the task can be worked on now: the event is approved (or in close-out) and it isn't locked. */
export function taskPermission(card: EventCard, taskId: string, actor: EventActor, action: TaskAction): { ok: true; task: EventTask } | { ok: false; reason: string } {
  const task = card.event.tasks?.find((t) => t.id === taskId);
  if (!task) return { ok: false, reason: card.event.tasks?.length ? "That task isn't on this event any more." : "This event's tasks unlock when it's approved." };
  if (!worksTeam(task.team, actor.roles)) return { ok: false, reason: `Only the ${TEAM_NAME[task.team]} team can work on this task.` };
  if (card.status !== "approved" && card.status !== "close_out") return { ok: false, reason: "This event isn't approved, so its tasks are on hold." };
  if (task.status === "locked") return { ok: false, reason: "This task unlocks when the event is approved." };
  if (action === "ask") return { ok: true, task };
  if (task.status === "done") return { ok: false, reason: "This task is already done." };
  if (action === "take" && task.assignee && lc(task.assignee) !== lc(actor.email)) return { ok: false, reason: `${task.assignee} already took this task.` };
  if (action === "take" && task.assignee) return { ok: false, reason: "You already have this task." };
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
  }
}

/** Who hears about a task change: the requester when it's done (in the portal), and when the team asks them something (an alert: they have to answer). */
export function taskNotices(after: EventCard, taskId: string, actor: EventActor, action: TaskAction, note = ""): Notice[] {
  const task = after.event.tasks?.find((t) => t.id === taskId);
  if (!task || lc(after.ownerEmail) === lc(actor.email)) return [];
  const what = `${after.id} “${after.title}”`;
  if (action === "done") {
    return [{ to: { email: after.ownerEmail }, cardId: after.id, href: `/events/${after.id}#tasks`, text: `${what}: ${TEAM_NAME[task.team]} finished “${task.title}”.${note.trim() ? ` Note: ${short(note, 140)}` : ""}`, alert: false, delegable: false }];
  }
  if (action === "ask") {
    return [{ to: { email: after.ownerEmail }, cardId: after.id, href: `/events/${after.id}#comments`, text: `${what}: ${TEAM_NAME[task.team]} has a question about “${task.title}”: “${short(note, 140)}” Answer in a comment on the event.`, alert: true, delegable: false }];
  }
  return [];
}
