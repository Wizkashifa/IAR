/**
 * IT & Maintenance rules, as plain functions over a card so they can be
 * tested without a server. Pages, server actions and the daily job call
 * these; they never change a ticket's status themselves.
 *
 * Who may do what:
 * - Anyone signed in can report a problem. The reporter can add photos and
 *   comments, confirm the fix or say it isn't fixed (reopen), and cancel while
 *   it's still new.
 * - Anyone on the ticket's team (IT Services for IT and A/V, Facility
 *   Maintenance for facilities; membership comes from the team's Google
 *   Group) can pick it up or assign it to another team member, start it, mark
 *   it waiting on parts and resolve it with a note.
 * - A ticket assigned to someone else can be handed on by that person, the
 *   team's chairs and vice chairs, or the IAR office. The office can assign
 *   but doesn't do the work.
 * - Portal admins get no team powers for being admins: pass the person's own
 *   group roles (Viewer.actingRoles), as purchases do.
 * - Preventive tickets have no reporter to confirm, so resolving closes them.
 * - Resolved tickets the reporter never confirms close themselves after
 *   7 days (the daily job).
 * - Every step is written to the ticket's history.
 */
import type { Card, CardStatus } from "../cards";
import { ORG, roleMailbox, type Role } from "../org";
import { type Directory, type Membership, groupSlug } from "../teams";
import {
  type TicketDetails,
  type TicketHistoryEntry,
  type TicketKind,
  type TicketPhoto,
  type TicketStatus,
  type TicketTeam,
  type Urgency,
  TEAM_LABEL,
  TEAM_NAME,
  URGENCY,
} from "./types";

/**
 * Who is acting. `roles` must be the person's own group roles, never the
 * admin "see everything" expansion. `leads`: the teams this person chairs or
 * vice-chairs (from their team memberships; see leadsOf).
 */
export type TicketActor = { email: string; name: string; roles: Role[]; leads?: TicketTeam[] };

export type TicketCard = Card & { type: "ticket"; ticket: TicketDetails };

export class WorkflowError extends Error {}

const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const lc = (s: string) => s.trim().toLowerCase();

/** Writes history entries for things the portal does by itself (the daily job). */
export const SYSTEM = "IAR Portal";

export function isTicketCard(c: Card | null | undefined): c is TicketCard {
  return Boolean(c && c.type === "ticket" && c.ticket);
}

// ---- Teams -----------------------------------------------------------------

/** The roles that put someone on each team's queue (see QUEUE_ROLES in teams.ts). */
export const TEAM_ROLES: Record<TicketTeam, Role[]> = { it: ["it", "av"], facilities: ["facilities"] };

/** The role a team's notices and Chat alerts go to. */
export const TEAM_ROLE: Record<TicketTeam, Role> = { it: "it", facilities: "facilities" };

/** Each team's Google Group slug (portal-team-<slug>@). */
const TEAM_SLUG: Record<TicketTeam, string> = { it: "it-services", facilities: "facility-maintenance" };

/** The team's Google Group address: its members can work its tickets. */
export function teamGroup(team: TicketTeam): string {
  return roleMailbox(TEAM_ROLE[team]) ?? `portal-team-${TEAM_SLUG[team]}@${ORG.domain}`;
}

export function onTeam(actor: Pick<TicketActor, "roles">, team: TicketTeam): boolean {
  return TEAM_ROLES[team].some((r) => actor.roles.includes(r));
}

/** The teams someone works tickets for. */
export function teamsOf(actor: Pick<TicketActor, "roles">): TicketTeam[] {
  return (["facilities", "it"] as TicketTeam[]).filter((t) => onTeam(actor, t));
}

/** Everyone in the team's Google Group (people, not nested groups), by email: who a ticket can be assigned to. */
export function teamMemberEmails(dir: Directory, team: TicketTeam): string[] {
  const g = dir.teams.find((x) => lc(x.email) === lc(teamGroup(team)));
  return [...new Set((g?.members ?? []).filter((m) => m.type === "USER").map((m) => lc(m.email)))].sort();
}

/** Teams a person chairs or vice-chairs, from their memberships in Google Groups. */
export function leadsOf(memberships: Membership[]): TicketTeam[] {
  const out = new Set<TicketTeam>();
  for (const m of memberships) {
    if (m.role === "member") continue;
    for (const t of ["it", "facilities"] as TicketTeam[]) if (groupSlug(m.group) === TEAM_SLUG[t]) out.add(t);
  }
  return [...out];
}

/** Who may import from Jira: portal admins (it's setup work) and the facilities team's chairs and vice chairs. */
export function canImportJira(actor: Pick<TicketActor, "roles" | "leads">): boolean {
  return actor.roles.includes("admins") || Boolean(actor.leads?.includes("facilities"));
}

// ---- Status ------------------------------------------------------------------

/** The shared card status for a ticket status. Resolved waits on the reporter, like a close-out. */
export function statusFor(s: TicketStatus): CardStatus {
  switch (s) {
    case "new":
      return "submitted";
    case "assigned":
    case "in_progress":
    case "waiting_parts":
    case "reopened":
      return "in_review";
    case "resolved":
      return "close_out";
    case "closed":
      return "closed";
    case "cancelled":
      return "cancelled";
  }
}

export const isOpen = (t: TicketDetails) => t.status !== "closed" && t.status !== "cancelled";
/** With the team: not yet resolved, closed or cancelled. */
export const withTeam = (t: TicketDetails) => isOpen(t) && t.status !== "resolved";

/** What the ticket is waiting on, in words, for My Requests and the lists. */
export function waitingOnFor(card: TicketCard): string | undefined {
  const t = card.ticket;
  const team = `${TEAM_LABEL[t.team]} team`;
  const who = t.assigneeEmail ?? team;
  switch (t.status) {
    case "new":
      return `${team}: pick it up`;
    case "assigned":
      return `${who}: start the work`;
    case "in_progress":
      return `${who}: working on it`;
    case "waiting_parts":
      return `${who}: waiting on parts`;
    case "reopened":
      return `${who}: reopened, not fixed yet`;
    case "resolved":
      return "You: check it's fixed and confirm";
    case "closed":
    case "cancelled":
      return undefined;
  }
}

/** Extra words search finds the ticket by. */
export function searchTextFor(t: TicketDetails): string {
  return [TEAM_LABEL[t.team], TEAM_NAME[t.team], t.room, t.equipment, t.jiraKey, ...(t.labels ?? []), t.assigneeEmail].filter(Boolean).join(" ");
}

function withStatus(card: TicketCard, t: TicketDetails, now: string): TicketCard {
  const next: TicketCard = { ...card, ticket: t, status: statusFor(t.status), updatedAt: now };
  next.waitingOn = waitingOnFor(next);
  next.searchText = searchTextFor(t);
  return next;
}

function entry(by: string, now: string, action: string, note?: string): TicketHistoryEntry {
  return note ? { at: now, by, action, note } : { at: now, by, action };
}

const addWatcher = (ws: string[], email?: string) => (email && !ws.some((w) => same(w, email)) ? [...ws, email.toLowerCase()] : ws);

// ---- New tickets -------------------------------------------------------------

export type NewTicketInput = {
  team: TicketTeam;
  kind: TicketKind;
  title: string;
  room: string;
  equipment?: string;
  urgency: Urgency;
  description: string;
};

/** A new ticket from checked form input. The store assigns the ID. */
export function newTicket(input: NewTicketInput, reporter: { email: string; name: string }, now: string): TicketCard {
  const t: TicketDetails = {
    team: input.team,
    kind: input.kind,
    status: "new",
    statusSince: now,
    room: input.room,
    equipment: input.equipment,
    urgency: input.urgency,
    description: input.description,
    reporterName: reporter.name,
    photos: [],
    watchers: [reporter.email.toLowerCase()],
    history: [entry(reporter.email.toLowerCase(), now, `Reported to the ${TEAM_LABEL[input.team]} team`, `Urgency: ${URGENCY[input.urgency].label}`)],
  };
  const card: TicketCard = {
    id: "",
    orgId: ORG.id,
    type: "ticket",
    title: input.title,
    status: "submitted",
    ownerEmail: reporter.email.toLowerCase(),
    committee: TEAM_NAME[input.team],
    createdAt: now,
    updatedAt: now,
    ticket: t,
  };
  return withStatus(card, t, now);
}

// ---- Who can act -------------------------------------------------------------

export type Action = "assign" | "start" | "wait" | "resolve" | "due" | "confirm" | "reopen" | "cancel" | "photos";

/** Whether `actor` may take `action` now, and if not, why. */
export function permission(card: TicketCard, actor: TicketActor, action: Action): { ok: true } | { ok: false; reason: string } {
  const t = card.ticket;
  const no = (reason: string) => ({ ok: false as const, reason });
  const own = same(card.ownerEmail, actor.email);
  const team = onTeam(actor, t.team);
  const lead = Boolean(actor.leads?.includes(t.team));
  const office = actor.roles.includes("office");
  const teamName = `the ${TEAM_LABEL[t.team]} team`;

  if (!isOpen(t)) return no(t.status === "cancelled" ? "This ticket was cancelled." : "This ticket is closed. If the problem is back, report it again.");

  switch (action) {
    case "confirm":
    case "reopen":
      if (!own) return no("Only the person who reported it can confirm the fix or reopen it.");
      if (t.status !== "resolved") return no("The team hasn't marked this fixed yet.");
      return { ok: true };
    case "cancel":
      if (!own) return no("Only the person who reported it can cancel it.");
      if (t.status !== "new") return no(`${teamName[0].toUpperCase()}${teamName.slice(1)} has already picked this up. Add a comment if it's no longer needed.`);
      return { ok: true };
    case "photos":
      if (!own && !team) return no(`Only the reporter and ${teamName} can add photos.`);
      return { ok: true };
  }

  if (t.status === "resolved") return no("This is marked fixed and waiting for the reporter to confirm.");
  switch (action) {
    case "assign":
      if (!team && !office) return no(`Only ${teamName} or the IAR office can assign it.`);
      if (t.assigneeEmail && !same(t.assigneeEmail, actor.email) && !lead && !office)
        return no(`It's assigned to ${t.assigneeEmail}. Only they, the team's chair or vice chair, or the IAR office can hand it to someone else.`);
      return { ok: true };
    case "due":
      if (!team && !office) return no(`Only ${teamName} or the IAR office can set a target date.`);
      return { ok: true };
    case "start":
      if (!team) return no(`Only ${teamName} can work on it.`);
      if (t.status === "in_progress") return no("Work has already started.");
      return { ok: true };
    case "wait":
      if (!team) return no(`Only ${teamName} can work on it.`);
      if (t.status === "waiting_parts") return no("It's already waiting on parts.");
      return { ok: true };
    case "resolve":
      if (!team) return no(`Only ${teamName} can mark it fixed.`);
      return { ok: true };
  }
  return no("Unknown action.");
}

function must(card: TicketCard, actor: TicketActor, action: Action) {
  const r = permission(card, actor, action);
  if (!r.ok) throw new WorkflowError(r.reason);
}

/** Someone other than the reporter answering counts as the first response. */
function responded(t: TicketDetails, card: TicketCard, actor: TicketActor, now: string): Pick<TicketDetails, "firstResponseAt"> {
  if (t.firstResponseAt || same(card.ownerEmail, actor.email)) return { firstResponseAt: t.firstResponseAt };
  return { firstResponseAt: now };
}

// ---- Transitions ---------------------------------------------------------------
// Each returns a new card; the caller saves it.

/**
 * Assign to a team member (or yourself). `members`: everyone in the team's
 * Google Group, by email. A new or reopened ticket becomes "assigned"; one
 * already being worked on keeps its status with the new person.
 */
export function assign(card: TicketCard, actor: TicketActor, now: string, to: string, members: string[]): TicketCard {
  must(card, actor, "assign");
  const email = lc(to);
  const t = card.ticket;
  if (!email) throw new WorkflowError("Choose who should take it.");
  if (!members.some((m) => same(m, email))) throw new WorkflowError(`${email} isn't on the ${TEAM_LABEL[t.team]} team's Google Group.`);
  if (same(t.assigneeEmail, email)) throw new WorkflowError(`It's already assigned to ${same(email, actor.email) ? "you" : email}.`);
  const self = same(email, actor.email);
  const action = t.assigneeEmail ? `Handed from ${t.assigneeEmail} to ${self ? "themselves" : email}` : self ? "Picked it up" : `Assigned to ${email}`;
  const status: TicketStatus = t.status === "new" || t.status === "reopened" ? "assigned" : t.status;
  const next: TicketDetails = {
    ...t,
    ...responded(t, card, actor, now),
    status,
    statusSince: status === t.status ? t.statusSince : now,
    assigneeEmail: email,
    watchers: addWatcher(t.watchers, email),
    history: [...t.history, entry(actor.email, now, action)],
  };
  return withStatus(card, next, now);
}

/** Start work (or carry on once parts arrive). Unassigned: it's assigned to whoever starts it. */
export function start(card: TicketCard, actor: TicketActor, now: string): TicketCard {
  must(card, actor, "start");
  const t = card.ticket;
  const history = [...t.history];
  let assigneeEmail = t.assigneeEmail;
  if (!assigneeEmail) {
    assigneeEmail = actor.email.toLowerCase();
    history.push(entry(actor.email, now, "Picked it up"));
  }
  history.push(entry(actor.email, now, t.status === "waiting_parts" ? "Parts are in; back to work" : "Started work"));
  const next: TicketDetails = {
    ...t,
    ...responded(t, card, actor, now),
    status: "in_progress",
    statusSince: now,
    assigneeEmail,
    watchers: addWatcher(t.watchers, assigneeEmail),
    history,
  };
  return withStatus(card, next, now);
}

/** Waiting on parts or a vendor. The note (what's on order, when it's due) goes to the reporter too. */
export function waitForParts(card: TicketCard, actor: TicketActor, now: string, note?: string): TicketCard {
  must(card, actor, "wait");
  const t = card.ticket;
  const next: TicketDetails = {
    ...t,
    ...responded(t, card, actor, now),
    status: "waiting_parts",
    statusSince: now,
    assigneeEmail: t.assigneeEmail ?? actor.email.toLowerCase(),
    watchers: addWatcher(t.watchers, t.assigneeEmail ?? actor.email),
    history: [...t.history, entry(actor.email, now, "Waiting on parts", note?.trim() || undefined)],
  };
  return withStatus(card, next, now);
}

/** Mark it fixed with a note saying what was done. Preventive tickets close; others wait for the reporter. */
export function resolve(card: TicketCard, actor: TicketActor, now: string, note: string): TicketCard {
  must(card, actor, "resolve");
  if (!note.trim()) throw new WorkflowError("Say what was done, so the reporter knows what to check.");
  const t = card.ticket;
  const preventive = t.kind === "preventive";
  const next: TicketDetails = {
    ...t,
    ...responded(t, card, actor, now),
    status: preventive ? "closed" : "resolved",
    statusSince: now,
    assigneeEmail: t.assigneeEmail ?? actor.email.toLowerCase(),
    watchers: addWatcher(t.watchers, t.assigneeEmail ?? actor.email),
    resolutionNote: note.trim(),
    resolvedAt: now,
    closedAt: preventive ? now : undefined,
    history: [...t.history, entry(actor.email, now, preventive ? "Done" : "Marked fixed", note.trim())],
  };
  return withStatus(card, next, now);
}

/** The reporter confirms it's fixed. */
export function confirm(card: TicketCard, actor: TicketActor, now: string): TicketCard {
  must(card, actor, "confirm");
  const t = card.ticket;
  const next: TicketDetails = { ...t, status: "closed", statusSince: now, closedAt: now, history: [...t.history, entry(actor.email, now, "Reporter confirmed it's fixed")] };
  return withStatus(card, next, now);
}

/** The reporter says it isn't fixed: back to the team, with the assignee kept. */
export function reopen(card: TicketCard, actor: TicketActor, now: string, note: string): TicketCard {
  must(card, actor, "reopen");
  if (!note.trim()) throw new WorkflowError("Say what's still wrong, so the team knows what to look at.");
  const t = card.ticket;
  const next: TicketDetails = {
    ...t,
    status: "reopened",
    statusSince: now,
    reopenNote: note.trim(),
    resolvedAt: undefined,
    remindedAt: undefined,
    history: [...t.history, entry(actor.email, now, "Reopened: not fixed", note.trim())],
  };
  return withStatus(card, next, now);
}

/** The reporter withdraws it before anyone has picked it up. */
export function cancel(card: TicketCard, actor: TicketActor, now: string): TicketCard {
  must(card, actor, "cancel");
  const t = card.ticket;
  const next: TicketDetails = { ...t, status: "cancelled", statusSince: now, history: [...t.history, entry(actor.email, now, "Cancelled by the reporter")] };
  return withStatus(card, next, now);
}

/** Set or clear the team's target date (YYYY-MM-DD). */
export function setDueDate(card: TicketCard, actor: TicketActor, now: string, date: string | undefined): TicketCard {
  must(card, actor, "due");
  const t = card.ticket;
  const d = date?.trim() || undefined;
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new WorkflowError("Pick a date.");
  if (d === t.dueDate) throw new WorkflowError(d ? "That's already the target date." : "There's no target date to clear.");
  const next: TicketDetails = { ...t, dueDate: d, history: [...t.history, entry(actor.email, now, d ? `Target date set to ${d}` : "Target date cleared")] };
  return withStatus(card, next, now);
}

/** Photos the reporter or the team added after reporting. */
export function addPhotos(card: TicketCard, actor: TicketActor, now: string, photos: TicketPhoto[]): TicketCard {
  must(card, actor, "photos");
  if (photos.length === 0) throw new WorkflowError("Choose a photo first.");
  const t = card.ticket;
  const next: TicketDetails = {
    ...t,
    photos: [...t.photos, ...photos],
    history: [...t.history, entry(actor.email, now, `Added ${photos.length} photo${photos.length === 1 ? "" : "s"}`)],
  };
  return withStatus(card, next, now);
}

/** Follow or stop following. Anyone who can open the ticket can; the reporter always follows. */
export function setWatching(card: TicketCard, email: string, on: boolean, now: string): TicketCard {
  const t = card.ticket;
  if (!on && same(card.ownerEmail, email)) throw new WorkflowError("You reported this, so you'll always hear about it.");
  const watchers = on ? addWatcher(t.watchers, email) : t.watchers.filter((w) => !same(w, email));
  if (watchers.length === t.watchers.length) throw new WorkflowError(on ? "You're already following it." : "You weren't following it.");
  return { ...card, ticket: { ...t, watchers }, updatedAt: now };
}

/** After a comment: an answer from the team (not the reporter) counts as the first response. Never changes the status. */
export function afterComment(card: TicketCard, actor: TicketActor, now: string): TicketCard {
  const t = card.ticket;
  if (t.firstResponseAt || same(card.ownerEmail, actor.email) || (!onTeam(actor, t.team) && !actor.roles.includes("office"))) return card;
  return { ...card, ticket: { ...t, firstResponseAt: now } };
}

export function isWatching(card: TicketCard, email: string): boolean {
  return same(card.ownerEmail, email) || card.ticket.watchers.some((w) => same(w, email));
}

// ---- The daily job's decisions ----------------------------------------------------

/** Resolved tickets close themselves this long after, if the reporter hasn't confirmed. */
export const AUTO_CLOSE_DAYS = 7;

export function shouldAutoClose(card: TicketCard, now: Date): boolean {
  const t = card.ticket;
  return t.status === "resolved" && Boolean(t.resolvedAt) && now.getTime() - Date.parse(t.resolvedAt!) >= AUTO_CLOSE_DAYS * 864e5;
}

export function autoClose(card: TicketCard, now: Date): TicketCard {
  if (!shouldAutoClose(card, now)) throw new WorkflowError("This ticket isn't ready to close by itself.");
  const at = now.toISOString();
  const t = card.ticket;
  const next: TicketDetails = {
    ...t,
    status: "closed",
    statusSince: at,
    closedAt: at,
    history: [...t.history, entry(SYSTEM, at, "Closed", `Marked fixed ${AUTO_CLOSE_DAYS} days ago and the reporter didn't reopen it.`)],
  };
  return withStatus(card, next, at);
}

/** Hours since the ticket landed with the team without anyone starting it, or null once work started. */
export function hoursUntouched(t: TicketDetails, now: Date): number | null {
  if (t.status !== "new" && t.status !== "assigned" && t.status !== "reopened") return null;
  return (now.getTime() - Date.parse(t.statusSince)) / 36e5;
}

/** Past its target response time and nobody has started it. */
export function pastResponseTarget(t: TicketDetails, now: Date): boolean {
  const h = hoursUntouched(t, now);
  return h !== null && h >= URGENCY[t.urgency].responseHours;
}

/**
 * High and urgent tickets nobody has started by their target response time:
 * one reminder each time the ticket lands with the team (new, or reopened).
 */
export function needsReminder(card: TicketCard, now: Date): boolean {
  const t = card.ticket;
  if (t.urgency !== "high" && t.urgency !== "urgent") return false;
  if (!pastResponseTarget(t, now)) return false;
  return !t.remindedAt || t.remindedAt < t.statusSince;
}

export function markReminded(card: TicketCard, now: Date): TicketCard {
  const at = now.toISOString();
  const t = card.ticket;
  const who = t.assigneeEmail ?? `the ${TEAM_LABEL[t.team]} team`;
  const next: TicketDetails = { ...t, remindedAt: at, history: [...t.history, entry(SYSTEM, at, `Reminded ${who}`, `Not started ${URGENCY[t.urgency].target} of reaching the team.`)] };
  return withStatus(card, next, at);
}

/** Open and late: past its target date, or not started past its target response time. */
export function isOverdue(card: TicketCard, now: Date, today: string): boolean {
  const t = card.ticket;
  if (!withTeam(t)) return false;
  return Boolean(t.dueDate && t.dueDate < today) || pastResponseTarget(t, now);
}
