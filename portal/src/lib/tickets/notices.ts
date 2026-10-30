/**
 * Who hears about an IT & Maintenance ticket when it moves, and whether they
 * get an alert (a Google Chat message).
 *
 * The plan's rule: alert only whoever has to act next.
 * - A new ticket: an alert in the team's Chat space ("Urgent" first when it is).
 * - Assigned: the assignee, by direct message.
 * - Marked fixed: the reporter, asking them to check and confirm.
 * - Reopened: the assignee, or the team if nobody has it.
 * Everything else (being worked on, waiting on parts, confirmed, cancelled,
 * comments) is a notice in the portal only. People following the ticket hear
 * what the reporter hears, without alerts. Plain functions so they can be tested.
 */
import { type Notice, type Recipient, collector, commentNotices } from "../notices";
import { TEAM_LABEL, URGENCY } from "./types";
import { type TicketActor, type TicketCard, TEAM_ROLE, withTeam } from "./workflow";
import { same } from "../text";

/** ": “note”" to end a sentence with what someone wrote, or just the full stop. */
const said = (note?: string) => (note ? `: “${note}”` : ".");

const label = (c: TicketCard) => `${c.id} “${c.title}” (${c.ticket.room})`;
const href = (c: TicketCard) => `/it-maintenance/${c.id}`;

function ticketCollector(after: TicketCard, actor: Pick<TicketActor, "email">) {
  return collector(after.id, actor.email, href(after));
}

/** The reporter and everyone following, except whoever is doing the work. */
function followers(c: TicketCard): Recipient[] {
  const emails = [c.ownerEmail, ...c.ticket.watchers].filter((e) => !same(e, c.ticket.assigneeEmail));
  return [...new Set(emails.map((e) => e.toLowerCase()))].map((email) => ({ email }));
}

/** Whoever has the ticket: its assignee, or the team's queue. */
const holder = (c: TicketCard): Recipient => (c.ticket.assigneeEmail ? { email: c.ticket.assigneeEmail } : { role: TEAM_ROLE[c.ticket.team] });

/**
 * Notices for one change, from the card before (null for a new ticket) to
 * after. The actor never notifies themselves.
 */
export function ticketNotices(before: TicketCard | null, after: TicketCard, actor: Pick<TicketActor, "email">): Notice[] {
  const { out, add } = ticketCollector(after, actor);
  const t = after.ticket;
  const what = label(after);
  const urgent = t.urgency === "urgent";

  if (!before) {
    const preventive = t.kind === "preventive";
    const text = preventive
      ? `Preventive maintenance due: ${what}${t.assigneeEmail ? " is assigned to you" : ""}.`
      : `${urgent ? "Urgent: " : ""}New ${TEAM_LABEL[t.team]} request ${what} from ${t.reporterName}${urgent ? "" : ` · ${URGENCY[t.urgency].label} urgency`}.`;
    add(holder(after), text, true);
    return out;
  }

  const b = before.ticket;
  if (t.assigneeEmail && !same(b.assigneeEmail, t.assigneeEmail) && withTeam(t)) {
    add({ email: t.assigneeEmail }, `${urgent ? "Urgent: " : ""}${what} is assigned to you.`, true);
    if (!b.assigneeEmail) for (const r of followers(after)) add(r, `${what} was picked up by ${t.assigneeEmail}.`, false);
  }
  if (t.status === b.status) return out;

  switch (t.status) {
    case "in_progress":
      for (const r of followers(after)) add(r, b.status === "waiting_parts" ? `${what}: the parts are in and work has started again.` : `${what} is being worked on.`, false);
      break;
    case "waiting_parts": {
      const note = [...t.history].reverse().find((h) => h.action === "Waiting on parts")?.note;
      for (const r of followers(after)) add(r, `${what} is waiting on parts${said(note)}`, false);
      break;
    }
    case "resolved":
      add({ email: after.ownerEmail }, `${what} was marked fixed${said(t.resolutionNote)} Check it and confirm, or reopen it if it's not fixed.`, true);
      for (const r of followers(after)) add(r, `${what} was marked fixed${said(t.resolutionNote)}`, false);
      break;
    case "reopened":
      add(holder(after), `${what} was reopened: the reporter says it isn't fixed${said(t.reopenNote)}`, true);
      break;
    case "closed":
      if (t.kind === "event" && b.status !== "resolved") {
        // An event's A/V, done: its requester hears what the team did.
        add({ email: after.ownerEmail }, `${what}: the A/V team marked it done${said(t.resolutionNote)}`, false);
      } else if (b.status === "resolved" && same(actor.email, after.ownerEmail)) {
        if (t.assigneeEmail) add({ email: t.assigneeEmail }, `${what}: ${t.reporterName} confirmed it's fixed. Thank you!`, false);
      } else if (b.status === "resolved") {
        add({ email: after.ownerEmail }, `${what} was closed: it was marked fixed a week ago and nobody reopened it.`, false);
      }
      break;
    case "cancelled":
      if (b.status !== "cancelled") add(holder(after), `${what} was cancelled by ${t.reporterName}. Nothing more to do.`, false);
      break;
  }
  return out;
}

/** The daily job's reminder: a high or urgent ticket nobody has started in its target time. */
export function reminderNotices(card: TicketCard, actor: Pick<TicketActor, "email">): Notice[] {
  const { out, add } = ticketCollector(card, actor);
  const t = card.ticket;
  add(holder(card), `Still waiting: ${label(card)} is ${URGENCY[t.urgency].label.toLowerCase()} urgency and hasn't been started. The aim is ${URGENCY[t.urgency].target}.`, true);
  return out;
}

/**
 * A new comment: the reporter, the assignee (or the team, when nobody has it
 * yet), people following it and earlier commenters hear about it in the
 * portal. No alert: a comment asks nothing of anyone by itself.
 */
export function ticketCommentNotices(card: TicketCard, by: Pick<TicketActor, "email" | "name">, text: string): Notice[] {
  const t = card.ticket;
  const also: Recipient[] = t.watchers.map((email) => ({ email }));
  if (withTeam(t) || t.status === "resolved") also.push(holder(card));
  return commentNotices(card, by, text, { href: href(card), what: label(card), also });
}
