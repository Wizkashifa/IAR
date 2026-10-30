/**
 * IT & Maintenance tickets as the portal's shared pages see them: who can
 * open one, its steps and what happens next, whether it waits on someone and
 * on whom. Collected in lib/registry.ts. Plain functions.
 */
import { FLAG, STATUS_LABEL as CARD_STATUS, STEP } from "../glossary";
import type { NeedsViewer } from "../needs-you";
import type { RowState } from "../card-row";
import type { ModuleDef } from "../registry";
import type { Holder } from "../stuck";
import { type NameOf, type Steps, type Viewer, speaker, stopAt, track } from "../steps";
import { same } from "../text";
import { canViewTicket } from "./access";
import { STATUS_LABEL, TEAM_NAME as TICKET_TEAM_NAME } from "./types";
import { AUTO_CLOSE_DAYS, type TicketCard, TEAM_ROLE, closesOnDone, isTicketCard, onTeam } from "./workflow";
import { addDays, todayLocal } from "../dates";
import { WEEK_DAYS } from "./today";

function ticketSteps(card: TicketCard): Steps {
  const t = card.ticket;
  // Preventive and event A/V tickets close when they're done: nobody confirms.
  const closes = closesOnDone(t.kind);
  const labels = closes ? [STEP.reported, STEP.pickedUp, STEP.beingWorkedOn, STEP.done] : [STEP.reported, STEP.pickedUp, STEP.beingWorkedOn, STEP.fixed, STEP.closed];
  const at = { new: 1, assigned: 2, in_progress: 2, waiting_parts: 2, reopened: 2, resolved: 4, closed: closes ? 4 : 5, cancelled: 1 }[t.status];
  const steps = track(labels, at);
  if (t.status === "waiting_parts") return { steps, flag: { label: FLAG.waitingParts, tone: "warn" } };
  if (t.status === "reopened") return { steps, flag: { label: FLAG.reopened, tone: "warn" } };
  if (t.status === "cancelled") return { steps: stopAt(steps), flag: { label: FLAG.withdrawn, tone: "bad" } };
  return { steps };
}

function ticketNext(card: TicketCard, viewer: Viewer, names: NameOf): string {
  const t = card.ticket;
  const s = speaker(viewer, names);
  const mine = same(card.ownerEmail, viewer.email);
  const team = `The ${TICKET_TEAM_NAME[t.team]} team`;
  const who = (you: string, they: string) => (t.assigneeEmail ? s.does(t.assigneeEmail, you, they) : `${team} ${they}`);
  switch (t.status) {
    case "new":
      return `${team} picks it up.${mine ? ` You'll be notified when it's ${closesOnDone(t.kind) ? "done" : "fixed"}.` : ""}`;
    case "assigned":
      return `${who("start", "starts")} the work.`;
    case "in_progress":
      return `${who("are working", "is working")} on it.`;
    case "waiting_parts":
      return `${who("are waiting", "is waiting")} on parts.`;
    case "reopened":
      return `${who("take", "takes")} another look.`;
    case "resolved":
      return mine
        ? `Check it's fixed and confirm, or reopen it. It closes by itself after ${AUTO_CLOSE_DAYS} days.`
        : `${s.name(card.ownerEmail)} checks it's fixed and confirms. It closes by itself after ${AUTO_CLOSE_DAYS} days.`;
    default:
      return "";
  }
}

function ticketNeeds(card: TicketCard, v: NeedsViewer): boolean {
  const t = card.ticket;
  if (!onTeam(v, t.team)) return false;
  // An event's A/V waits on the team once its date is this week, as on My work today.
  if (t.kind === "event" && (t.dueDate ?? "") > addDays(todayLocal(), WEEK_DAYS - 1)) return false;
  if (t.status === "new") return true;
  if (t.status === "assigned" || t.status === "in_progress" || t.status === "waiting_parts" || t.status === "reopened") return t.assigneeEmail ? same(t.assigneeEmail, v.email) : true;
  return false;
}

function holder(card: TicketCard): Holder | null {
  const t = card.ticket;
  if (["closed", "cancelled"].includes(t.status)) return null;
  if (t.status === "resolved") return { to: [{ email: card.ownerEmail }], step: "Fixed: waiting for the reporter to confirm" };
  return { to: [t.assigneeEmail ? { email: t.assigneeEmail } : { role: TEAM_ROLE[t.team] }], step: STATUS_LABEL[t.status] };
}

/** The list pill: what's needed from you, or who has it (see ModuleDef.rowStatus). Late tickets keep their own words. */
function rowStatus(card: TicketCard, state: RowState): string | undefined {
  const t = card.ticket;
  const team = TICKET_TEAM_NAME[t.team];
  if (state === "bad") return t.status === "reopened" ? undefined : `Late: with ${team}`;
  switch (t.status) {
    case "new":
      return state === "act" ? "Needs picking up" : `With ${team}`;
    case "assigned":
    case "in_progress":
      return state === "act" ? "Needs your work" : `With ${team}`;
    case "waiting_parts":
      return state === "act" ? "Needs your work: waiting on parts" : `With ${team}: waiting on parts`;
    case "resolved":
      return state === "act" ? "Fixed: needs your OK" : "Fixed: with the reporter to confirm";
    default:
      return undefined;
  }
}

export const ticketModule: ModuleDef<TicketCard> = {
  type: "ticket",
  is: isTicketCard,
  canView: canViewTicket,
  statusText: (card) => (card.ticket.status === "resolved" ? "Fixed: please confirm" : (STATUS_LABEL[card.ticket.status] ?? CARD_STATUS[card.status])),
  steps: ticketSteps,
  next: ticketNext,
  needs: ticketNeeds,
  holder,
  rowStatus,
};
