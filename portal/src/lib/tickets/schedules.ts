/**
 * Preventive maintenance schedules: "check the HVAC filters every month".
 * On the due day the daily job opens a preventive ticket for the team and
 * moves the schedule to its next date. The team (and its chairs) add, edit
 * and pause schedules at /it-maintenance/schedules. Plain functions so they
 * can be tested; the store is in schedule-store.ts.
 */
import { ORG } from "../org";
import { type TicketDetails, type TicketTeam, type Urgency, TEAM_NAME, URGENCIES } from "./types";
import { type TicketActor, type TicketCard, onTeam, searchTextFor, statusFor, teamGroup, waitingOnFor } from "./workflow";

export type Frequency = "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly";

export const FREQUENCIES: Frequency[] = ["weekly", "monthly", "quarterly", "semiannual", "yearly"];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Every week",
  monthly: "Every month",
  quarterly: "Every 3 months",
  semiannual: "Every 6 months",
  yearly: "Every year",
};

export type TicketSchedule = {
  id: string;
  team: TicketTeam;
  name: string;
  frequency: Frequency;
  /** The next day a ticket opens (YYYY-MM-DD, Raleigh time). */
  next: string;
  room: string;
  equipment?: string;
  /** What to do, copied onto each ticket. */
  description?: string;
  urgency: Urgency;
  /** Who each ticket goes to. Unset: the team's queue. */
  assigneeEmail?: string;
  paused: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** The last ticket it opened, and the day. */
  lastTicketId?: string;
  lastCreatedOn?: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: string) => DATE.test(s) && new Date(`${s}T12:00:00Z`).toISOString().startsWith(s);

/** The date one period after `ymd`. Months keep the day, or the month's last day when it's shorter (Jan 31 → Feb 28). */
export function addFrequency(ymd: string, f: Frequency): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (f === "weekly") return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  const months = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[f];
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

/** The first date after `today` on the schedule from `from`: missed dates are skipped, not piled up. */
export function nextAfter(from: string, f: Frequency, today: string): string {
  let next = addFrequency(from, f);
  for (let i = 0; next <= today && i < 1000; i++) next = addFrequency(next, f);
  return next;
}

export function isDue(s: TicketSchedule, today: string): boolean {
  return !s.paused && s.next <= today;
}

/** Schedules that should open a ticket today. */
export function dueSchedules(list: TicketSchedule[], today: string): TicketSchedule[] {
  return list.filter((s) => isDue(s, today));
}

/** The team (its chairs and vice chairs are on it too) manages its own schedules. */
export function canManageSchedules(actor: Pick<TicketActor, "roles">, team: TicketTeam): boolean {
  return onTeam(actor, team);
}

const fmtDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * The preventive ticket a schedule opens, due on its scheduled day. It belongs
 * to the team's Google Group rather than a person, so it's in nobody's My
 * Requests, and resolving it closes it (there's no reporter to confirm).
 */
export function ticketFromSchedule(s: TicketSchedule, now: string): TicketCard {
  const t: TicketDetails = {
    team: s.team,
    kind: "preventive",
    status: s.assigneeEmail ? "assigned" : "new",
    statusSince: now,
    room: s.room,
    equipment: s.equipment,
    urgency: s.urgency,
    description: s.description || `Preventive maintenance: ${s.name}.`,
    reporterName: "Preventive schedule",
    photos: [],
    assigneeEmail: s.assigneeEmail,
    watchers: s.assigneeEmail ? [s.assigneeEmail] : [],
    dueDate: s.next,
    scheduleId: s.id,
    history: [
      { at: now, by: "IAR Portal", action: `Opened by the “${s.name}” schedule (${FREQUENCY_LABEL[s.frequency].toLowerCase()})`, ...(s.assigneeEmail ? { note: `Assigned to ${s.assigneeEmail}` } : {}) },
    ],
  };
  const card: TicketCard = {
    id: "",
    orgId: ORG.id,
    type: "ticket",
    title: `${s.name} – ${fmtDay(s.next)}`,
    status: statusFor(t.status),
    ownerEmail: teamGroup(s.team),
    committee: TEAM_NAME[s.team],
    createdAt: now,
    updatedAt: now,
    ticket: t,
  };
  card.waitingOn = waitingOnFor(card);
  card.searchText = searchTextFor(t);
  return card;
}

/** The schedule once today's ticket is open: moved to its next date. */
export function afterOpening(s: TicketSchedule, ticketId: string, today: string, now: string): TicketSchedule {
  return { ...s, next: nextAfter(s.next, s.frequency, today), lastTicketId: ticketId, lastCreatedOn: today, updatedAt: now };
}

export type ScheduleInput = Partial<Record<"team" | "name" | "frequency" | "next" | "room" | "equipment" | "description" | "urgency" | "assignee", unknown>>;
export type ScheduleFields = Pick<TicketSchedule, "team" | "name" | "frequency" | "next" | "room" | "equipment" | "description" | "urgency" | "assigneeEmail">;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Check a schedule from the form. `members`: each team's Google Group members,
 * so a schedule only assigns to someone who can work the ticket. A new
 * schedule's first date can't be in the past (it would open at once).
 */
export function parseScheduleInput(raw: ScheduleInput, ctx: { today: string; members: Record<TicketTeam, string[]>; isNew: boolean }): { ok: true; value: ScheduleFields } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const team = str(raw.team) as TicketTeam;
  if (team !== "it" && team !== "facilities") errors.push("Choose the team.");
  const name = str(raw.name).replace(/\s+/g, " ");
  if (name.length < 3) errors.push("Name the job, like “HVAC filter check”.");
  else if (name.length > 80) errors.push("Keep the name under 80 characters.");
  const frequency = str(raw.frequency) as Frequency;
  if (!FREQUENCIES.includes(frequency)) errors.push("Choose how often.");
  const next = str(raw.next);
  if (!isDate(next)) errors.push("Choose the next date.");
  else if (ctx.isNew && next < ctx.today) errors.push("The first date can't be in the past.");
  const room = str(raw.room);
  if (!room) errors.push("Choose where.");
  else if (room.length > 120) errors.push("Keep the location under 120 characters.");
  const equipment = str(raw.equipment) || undefined;
  if (equipment && equipment.length > 120) errors.push("Keep the equipment under 120 characters.");
  const description = str(raw.description) || undefined;
  if (description && description.length > 3000) errors.push("Keep the instructions under 3,000 characters.");
  const urgency = (str(raw.urgency) || "normal") as Urgency;
  if (!URGENCIES.includes(urgency)) errors.push("Choose an urgency.");
  const assigneeEmail = str(raw.assignee).toLowerCase() || undefined;
  if (assigneeEmail && (team === "it" || team === "facilities") && !(ctx.members[team] ?? []).includes(assigneeEmail))
    errors.push(`${assigneeEmail} isn't on that team's Google Group.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { team, name, frequency, next, room, equipment, description, urgency, assigneeEmail } };
}
