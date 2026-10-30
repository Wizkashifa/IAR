"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cardStore, ConflictError } from "@/lib/cards";
import { internalPath } from "@/lib/links";
import { deliver } from "@/lib/notifications";
import type { Notice } from "@/lib/notices";
import { requireViewer } from "@/lib/viewer";
import { closeOutNotices, linkedPurchases, spendOf, submitCloseOut } from "@/lib/events/closeout";
import { eventActor, eventContext } from "@/lib/events/context";
import { TASK_TEAMS, TaskError, type TaskAction, actOnTask, assignTask, taskNotices } from "@/lib/events/tasks";
import { queueTeamMembers } from "@/lib/groups";
import * as wf from "@/lib/events/workflow";
import { WorkflowError } from "@/lib/workflow-core";

/**
 * Team tasks and close-out: the server actions behind the teams' task lists and the
 * event page. The rules are in lib/events (tasks.ts, closeout.ts); these
 * load the card, apply one,
 * save it only if nobody else saved it first, and send the notices.
 */

const nowIso = () => new Date().toISOString();

/** `back` with ?ok= or ?error= added, keeping any #anchor. */
function withResult(back: string, key: "ok" | "error", value: string): string {
  const [path, hash] = back.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}${hash ? `#${hash}` : ""}`;
}

/**
 * Load the card, change it and save it. A task doesn't depend
 * on the rest of the card, so if someone else saved it at the same moment it
 * tries once more on the fresh card.
 */
async function change(id: string, by: string, apply: (card: wf.EventCard) => { next: wf.EventCard; notices: Notice[] }): Promise<string | null> {
  const store = await cardStore();
  for (let attempt = 0; attempt < 2; attempt++) {
    const card = await store.get(id);
    if (!wf.isEventCard(card)) return "That event no longer exists.";
    try {
      const { next, notices } = apply(card);
      await store.save(next, card.updatedAt);
      await deliver(notices, by);
      return null;
    } catch (err) {
      if (err instanceof ConflictError && attempt === 0) continue;
      if (err instanceof TaskError || err instanceof WorkflowError || err instanceof ConflictError) return err.message;
      console.error("event task change failed", err);
      return "Something went wrong. Nothing was changed.";
    }
  }
  return "Someone else changed this event a moment ago. Try again.";
}

const OK_TEXT: Record<TaskAction, string> = { take: "taken", start: "started", done: "done", ask: "asked", assign: "assigned" };

/** Take, start or finish a team task, hand it to someone else on the team, or ask the requester a question about it. */
export async function workOnTask(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = { ...eventActor(viewer), name: viewer.name };
  const id = String(form.get("id") ?? "");
  const taskId = String(form.get("task") ?? "");
  const action = String(form.get("step") ?? "") as TaskAction;
  const note = String(form.get("note") ?? "").slice(0, 1000);
  const back = internalPath(String(form.get("back") ?? "")) ?? `/events/${id}`;
  const to = String(form.get("assignee") ?? "");
  // Who each team's tasks can be handed to: everyone in its Google Group.
  const members = action === "assign" ? new Map(await Promise.all(TASK_TEAMS.map(async (t) => [t, await queueTeamMembers(t)] as const))) : null;
  const error = !OK_TEXT[action]
    ? "Unknown action."
    : await change(id, actor.email, (card) => {
        const team = card.event.tasks?.find((t) => t.id === taskId)?.team;
        const next = members ? assignTask(card, taskId, actor, to, (team && members.get(team)) || [], nowIso()) : actOnTask(card, taskId, actor, action, nowIso(), note);
        return { next, notices: taskNotices(next, taskId, actor, action, note) };
      });
  revalidatePath("/it-maintenance");
  revalidatePath("/it-maintenance/today");
  revalidatePath("/marketing");
  revalidatePath(`/events/${id}`);
  redirect(withResult(back, error ? "error" : "ok", error ?? `task-${OK_TEXT[action]}`));
}

/** The requester (or the office) closes out the event: attendance, how it went, and the final costs. */
export async function closeOutEvent(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = eventActor(viewer);
  const id = String(form.get("id") ?? "");
  const back = `/events/${id}#closeout`;
  const store = await cardStore();
  const card = await store.get(id);
  if (!wf.isEventCard(card)) redirect("/events");
  if (String(form.get("expected") ?? "") !== card.updatedAt) redirect(withResult(back, "error", "This event changed while you were looking at it. Check it again before closing it out."));
  let error: string | null = null;
  try {
    const spent = spendOf(linkedPurchases(await store.listPurchasesForEvent(id), id));
    const ctx = await eventContext();
    const next = submitCloseOut(
      card,
      actor,
      nowIso(),
      { attendance: String(form.get("attendance") ?? ""), notes: String(form.get("notes") ?? ""), costsConfirmed: form.get("costsConfirmed") === "on", depositRefund: form.get("depositRefund") === "on" },
      spent,
      ctx.directorsOf(card.event.committeeGroup),
    );
    await store.save(next, card.updatedAt);
    await deliver(closeOutNotices(card, next, actor), actor.email);
  } catch (err) {
    if (err instanceof WorkflowError || err instanceof ConflictError) error = err.message;
    else {
      console.error("close-out failed", err);
      error = "Something went wrong. Nothing was changed.";
    }
  }
  revalidatePath("/events");
  revalidatePath(`/events/${id}`);
  redirect(withResult(back, error ? "error" : "ok", error ?? "closed-out"));
}
