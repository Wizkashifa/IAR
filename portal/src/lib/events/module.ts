/**
 * Events & Rooms as the portal's shared pages see it: who can open one, its
 * steps and what happens next, whether it waits on someone and on whom.
 * Collected in lib/registry.ts. Plain functions.
 */
import type { Viewing } from "../access";
import { todayLocal } from "../dates";
import { NOTIFIED, STATUS_LABEL, STEP } from "../glossary";
import type { NeedsContext, NeedsViewer } from "../needs-you";
import type { RowState } from "../card-row";
import type { ModuleDef } from "../registry";
import type { Holder, StuckContext } from "../stuck";
import { type NameOf, type StepOptions, type Steps, type Viewer, finish, quoted, speaker, track } from "../steps";
import { andList, same } from "../text";
import { canViewEvent } from "./access";
import { lastDate } from "./closeout";
import { TEAM_NAME as TASK_TEAM_NAME, isTeamTask } from "./tasks";
import { changeApprovers, changePermission } from "./reschedule";
import { dayText, timeText } from "./series";
import { type EventCard, STAGE_LABEL, isEventCard, permission, reviewersFor } from "./workflow";

function eventSteps(card: EventCard, o: StepOptions): Steps {
  const e = card.event;
  const today = o.today ?? todayLocal();
  const labels: string[] = [
    STEP.submitted,
    ...(e.stage === "slot" ? [STEP.roomAnswer] : []),
    STEP.director,
    STEP.executiveReview,
    STEP.approved,
    STEP.eventDay,
    STEP.closeOut,
    STEP.closed,
  ];
  const index = (l: string) => labels.indexOf(l);
  const passed = new Set(e.approvals.map((a) => a.stage));
  let at: number;
  if (card.status === "closed" || e.stage === "done") at = labels.length;
  else if (card.status === "close_out") at = index(STEP.closeOut);
  else if (e.stage === "approved") at = e.dates.length && lastDate(card) < today ? index(STEP.closeOut) : index(STEP.eventDay);
  else at = index({ slot: STEP.roomAnswer, director: STEP.director, mission: STEP.executiveReview }[e.stage]);
  const skip: string[] = [];
  const pastDirector = e.stage === "mission" || e.stage === "approved" || e.stage === "done";
  const noDirector = o.directors !== undefined && reviewersFor(card.ownerEmail, o.directors).length === 0;
  if ((pastDirector && !passed.has("director")) || (!pastDirector && e.stage !== "director" && noDirector)) skip.push(STEP.director);
  // Moved to give up its time: only the director approves the new time.
  if (e.releasedFor) skip.push(STEP.executiveReview);
  const steps = track(labels, at, skip);
  return finish(card, steps);
}

function eventNext(card: EventCard, viewer: Viewer, names: NameOf, o: StepOptions): string {
  const e = card.event;
  const s = speaker(viewer, names);
  const mine = same(card.ownerEmail, viewer.email);
  const notified = mine ? ` ${NOTIFIED}` : "";
  if (card.status === "changes_requested")
    return e.releasedFor
      ? `${s.does(card.ownerEmail, "pick", "picks")} a new time. Only the director needs to approve it.`
      : `${s.does(card.ownerEmail, "make", "makes")} the changes asked for${quoted(e.returnNote)} and ${mine ? "send" : "sends"} it again.`;
  if (card.status === "close_out") return `${s.does(card.ownerEmail, "add", "adds")} the attendance and final costs to close it out.`;
  if (card.status === "denied" || card.status === "cancelled" || card.status === "closed") return "";
  switch (e.stage) {
    case "slot":
      return `Whoever holds the booked time answers ${mine ? "your" : "the"} ask for it. If they give it up, the request goes on to review.${notified}`;
    case "director": {
      const who = reviewersFor(card.ownerEmail, o.directors ?? []);
      const reviewer = who.length ? `${s.anyOf(who)} (director)` : "The committee's director";
      const one = who.some((d) => same(d, viewer.email));
      return e.releasedFor
        ? `${reviewer} ${one ? "approve" : "approves"} the new time. There's no executive review, because it moved to give up its time.${notified}`
        : `${reviewer} ${one ? "review" : "reviews"} it against IAR's mission, then an executive gives final approval.${notified}`;
    }
    case "mission":
      return !mine && (viewer.actingRoles ?? []).includes("executive")
        ? "You give final approval as an executive. Then the room is confirmed on the IAR calendar and the teams get their tasks."
        : `An executive gives final approval. Then the room is confirmed on the IAR calendar and the teams get their tasks.${notified}`;
    case "approved": {
      if (e.change) {
        const who = changeApprovers(card, o.directors ?? []);
        const one = who.some((d) => same(d, viewer.email)) || (!who.length && !mine && (viewer.actingRoles ?? []).includes("executive"));
        const approver = who.length ? `${s.anyOf(who)} (director)` : one ? "You" : "An executive";
        return `${approver} ${one ? "approve" : "approves"} the new time, ${dayText(e.change.date)}, ${timeText(e.change.start)}–${timeText(e.change.end)}. Until then the approved time stays booked.${notified}`;
      }
      // Only teams that still get tasks: an older event's Security task isn't anyone's to do.
      const open = (e.tasks ?? []).filter((t) => isTeamTask(t) && t.status !== "done").map((t) => TASK_TEAM_NAME[t.team]);
      const teams = open.length ? `${andList(open)} ${open.length > 1 ? "get" : "gets"} it ready. ` : "";
      return `${teams}After the event, ${s.does(card.ownerEmail, "add", "adds").replace(/^You /, "you ")} the attendance and ${mine ? "close" : "closes"} it out.`;
    }
    case "done":
      return "";
  }
}

function eventNeeds(card: EventCard, v: NeedsViewer, ctx: NeedsContext): boolean {
  const directors = ctx.directorsOf?.(card.event.committeeGroup) ?? [];
  return permission(card, v, "approve", directors).ok || changePermission(card, v, directors).ok;
}

function holder(card: EventCard, ctx: StuckContext): Holder | null {
  const e = card.event;
  const owner = { email: card.ownerEmail };
  if (card.status === "changes_requested") return { to: [owner], step: e.releasedFor ? "Picking a new time" : "Back with the requester" };
  if (card.status === "close_out") return { to: [owner], step: "Close-out" };
  switch (e.stage) {
    case "slot":
      // The ask has its own reminders and escalation in the daily job.
      return { to: [], step: "Waiting for a booked time" };
    case "director": {
      const who = reviewersFor(card.ownerEmail, ctx.directorsOf?.(e.committeeGroup) ?? []);
      return { to: who.length ? who.map((email) => ({ email })) : [{ role: "executive" }], step: "Director review" };
    }
    case "mission":
      return { to: [{ role: "executive" }], step: "Executive review" };
    case "approved": {
      if (!e.change) return null;
      const who = changeApprovers(card, ctx.directorsOf?.(e.committeeGroup) ?? []);
      return { to: who.length ? who.map((email) => ({ email })) : [{ role: "executive" }], step: "New time" };
    }
    default:
      return null;
  }
}

/** The list pill: what's needed from you, or who has it (see ModuleDef.rowStatus). */
function rowStatus(card: EventCard, state: RowState): string | undefined {
  const reviewing = card.status === "submitted" || card.status === "in_review";
  if (card.status === "denied") return "Turned down";
  if (card.status === "cancelled") return "Cancelled";
  if (card.status === "changes_requested") return state === "act" ? "Needs changes from you" : "With the requester";
  if (card.status === "close_out") return state === "act" ? "Needs your close-out" : "With the requester to close out";
  if (reviewing && card.event.stage === "slot") return state === "act" ? "Needs your answer on the room" : "Waiting on a room answer";
  if (reviewing && card.event.stage === "director") return state === "act" ? "Needs your approval" : "With the director";
  if (reviewing && card.event.stage === "mission") return state === "act" ? "Needs your approval" : "With the executives";
  if (card.status === "approved" && card.event.change) return state === "act" ? "Needs your approval of a new time" : "New time waiting for approval";
  if (card.status === "approved") return state === "act" ? "Needs you" : "Approved";
  return undefined;
}

export const eventModule: ModuleDef<EventCard> = {
  type: "event",
  is: isEventCard,
  canView: (card: EventCard, v: Viewing) => canViewEvent(card, v),
  statusText: (card) => (card.status === "submitted" || card.status === "in_review" ? STAGE_LABEL[card.event.stage] : STATUS_LABEL[card.status]),
  steps: eventSteps,
  next: eventNext,
  needs: eventNeeds,
  holder,
  rowStatus,
};
