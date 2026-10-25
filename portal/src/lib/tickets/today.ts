/**
 * "My work today" for the IT Services and Facility Maintenance teams: what's
 * assigned to me, what nobody on my team has taken, and preventive work due
 * this week. Plain functions so the order can be tested; the page only shows
 * what these return.
 */
import type { Card } from "../cards";
import type { TicketSchedule } from "./schedules";
import type { Urgency } from "./types";
import { type TicketActor, type TicketCard, isOverdue, isTicketCard, teamsOf, withTeam } from "./workflow";

export type WorkToday = {
  /** Assigned to me: urgent and late first, then due today, then the rest. */
  mine: TicketCard[];
  /** My teams' requests nobody has taken yet, most urgent and oldest first. */
  untaken: TicketCard[];
  /** Preventive tickets due within the week, mine or nobody's yet. */
  preventive: TicketCard[];
  /** Schedules that open a preventive ticket within the week, mine or nobody's. */
  upcoming: TicketSchedule[];
};

/** How many days ahead counts as "this week". */
export const WEEK_DAYS = 7;

const URGENCY_ORDER: Urgency[] = ["urgent", "high", "normal", "low"];
const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** YYYY-MM-DD plus n days. */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0: urgent or late; 1: due today; 2: the rest. */
function band(c: TicketCard, now: Date, today: string): number {
  if (c.ticket.urgency === "urgent" || isOverdue(c, now, today)) return 0;
  if (c.ticket.dueDate === today) return 1;
  return 2;
}

function byUrgencyThenAge(a: TicketCard, b: TicketCard): number {
  return URGENCY_ORDER.indexOf(a.ticket.urgency) - URGENCY_ORDER.indexOf(b.ticket.urgency) || a.ticket.statusSince.localeCompare(b.ticket.statusSince);
}

export function workToday(cards: Card[], actor: Pick<TicketActor, "email" | "roles">, now: Date, today: string, schedules: TicketSchedule[] = []): WorkToday {
  const teams = teamsOf(actor);
  const weekEnd = addDays(today, WEEK_DAYS - 1);
  const open = cards.filter(isTicketCard).filter((c) => withTeam(c.ticket) && teams.includes(c.ticket.team));
  const mineOrNobody = (c: TicketCard) => !c.ticket.assigneeEmail || same(c.ticket.assigneeEmail, actor.email);

  const mine = open
    .filter((c) => c.ticket.kind !== "preventive" && same(c.ticket.assigneeEmail, actor.email))
    .sort((a, b) => band(a, now, today) - band(b, now, today) || (a.ticket.dueDate ?? "9999").localeCompare(b.ticket.dueDate ?? "9999") || byUrgencyThenAge(a, b));
  const untaken = open.filter((c) => c.ticket.kind !== "preventive" && !c.ticket.assigneeEmail).sort(byUrgencyThenAge);
  const preventive = open
    .filter((c) => c.ticket.kind === "preventive" && mineOrNobody(c) && (!c.ticket.dueDate || c.ticket.dueDate <= weekEnd))
    .sort((a, b) => (a.ticket.dueDate ?? "").localeCompare(b.ticket.dueDate ?? "") || byUrgencyThenAge(a, b));
  const upcoming = schedules
    .filter((s) => !s.paused && teams.includes(s.team) && (!s.assigneeEmail || same(s.assigneeEmail, actor.email)) && s.next > today && s.next <= weekEnd)
    .sort((a, b) => a.next.localeCompare(b.next) || a.name.localeCompare(b.name));
  return { mine, untaken, preventive, upcoming };
}

/** Whether this person works tickets (and so has a "My work today"). */
export const worksTickets = (actor: Pick<TicketActor, "roles">) => teamsOf(actor).length > 0;
