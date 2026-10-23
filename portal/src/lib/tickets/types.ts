/**
 * IT & Maintenance: the fields a ticket card carries on top of the shared
 * Card (see lib/cards.ts). Design: docs/plan.md (IT & Maintenance tickets)
 * and the demo (demo/index.html, "Tickets").
 *
 * Beta core only: report, assign, work, resolve, confirm; preventive
 * schedules; a one-time Jira import. Sprints, epics, sub-tasks and reports
 * wait until the facilities lead confirms they use them.
 */

/** Which team works it. IT Services covers IT and A/V. */
export type TicketTeam = "it" | "facilities";

/** A problem (something broke), a request (something new), or preventive maintenance from a schedule. */
export type TicketKind = "problem" | "request" | "preventive";

export type Urgency = "low" | "normal" | "high" | "urgent";

/**
 * Where the ticket is. The shared Card.status is derived from this (see
 * statusFor in workflow.ts).
 *
 * new → assigned → in_progress ⇄ waiting_parts → resolved → closed
 * The reporter confirms the fix (closed) or says it isn't fixed (reopened,
 * back with the team). Resolved tickets close themselves after 7 days.
 * The reporter can cancel while it's still new.
 */
export type TicketStatus = "new" | "assigned" | "in_progress" | "waiting_parts" | "resolved" | "reopened" | "closed" | "cancelled";

export type TicketPhoto = {
  name: string;
  size: number;
  /** Google Drive file ID in the Maintenance Photos Shared Drive (production). */
  driveFileId?: string;
  url?: string;
  at: string;
  by: string;
};

export type TicketHistoryEntry = { at: string; by: string; action: string; note?: string };

export type TicketDetails = {
  team: TicketTeam;
  kind: TicketKind;
  status: TicketStatus;
  /** When the current status started. */
  statusSince: string;
  /** Free text, picked from the location list (lib/tickets/locations.ts) or typed. */
  room: string;
  equipment?: string;
  urgency: Urgency;
  description: string;
  /** The reporter's name as they gave it (or "Preventive schedule"). */
  reporterName: string;
  photos: TicketPhoto[];
  assigneeEmail?: string;
  /** People who follow the ticket and hear when it moves. The reporter always does. */
  watchers: string[];
  history: TicketHistoryEntry[];
  /** What the team did, written when they resolve it. */
  resolutionNote?: string;
  /** The reporter's reason when they reopened it. */
  reopenNote?: string;
  /** Target date set by the team (YYYY-MM-DD). Preventive tickets: the scheduled day. */
  dueDate?: string;
  /** "FAC-123": imported from Jira; re-importing skips it. */
  jiraKey?: string;
  /** Labels carried over from Jira. */
  labels?: string[];
  /** The preventive schedule that opened it. */
  scheduleId?: string;
  /** The first time someone on the team picked it up, started it or answered. */
  firstResponseAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  /** When the daily job last reminded someone it's waiting past its response time. */
  remindedAt?: string;
};

export const TEAM_LABEL: Record<TicketTeam, string> = { it: "IT", facilities: "Facilities" };

/** The team's name as people know it (and its committee on the card). */
export const TEAM_NAME: Record<TicketTeam, string> = { it: "IT Services", facilities: "Facility Maintenance" };

/** What the reporter picks on the form. */
export const TEAM_CHOICE: Record<TicketTeam, { label: string; hint: string }> = {
  facilities: { label: "Building or maintenance", hint: "Heating and cooling, plumbing, lights, doors and locks, cleaning, the grounds." },
  it: { label: "IT, A/V or tech", hint: "Wi-Fi, computers, printers, accounts and email, projectors, microphones and sound." },
};

export const KIND_LABEL: Record<TicketKind, string> = {
  problem: "Something's broken",
  request: "A request",
  preventive: "Preventive maintenance",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "Being worked on",
  waiting_parts: "Waiting on parts",
  resolved: "Fixed — please confirm",
  reopened: "Reopened",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const URGENCIES: Urgency[] = ["low", "normal", "high", "urgent"];

/**
 * Urgency, in the reporter's words, with the time the team aims to pick it up
 * in (calendar hours). The daily job reminds the team once about high and
 * urgent tickets nobody has picked up by then.
 */
export const URGENCY: Record<Urgency, { label: string; hint: string; responseHours: number; target: string }> = {
  low: { label: "Low", hint: "An annoyance; nobody is held up.", responseHours: 72, target: "within 3 days" },
  normal: { label: "Normal", hint: "Something doesn't work, but there's a way around it.", responseHours: 24, target: "within a day" },
  high: { label: "High", hint: "It's stopping a program or a lot of people.", responseHours: 8, target: "within 8 hours" },
  urgent: { label: "Urgent", hint: "Safety, a leak, no power or heat, or a service today.", responseHours: 2, target: "within 2 hours" },
};
