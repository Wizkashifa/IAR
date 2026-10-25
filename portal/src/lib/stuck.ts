/**
 * "What's stuck" (app/stuck): every open request, by how long it has waited
 * at its current step, who it's waiting on, and a reminder the office can
 * send. Requests only, no money totals. Plain functions so they can be
 * tested; the page loads the cards, calls these, saves and delivers.
 *
 * Who a request waits on comes from the same rules the modules use for their
 * own alerts and the daily job's reminders (purchases/reminders.ts
 * `waitingOn`, the marketing and ticket notices), so a reminder from this page
 * reaches the same people, through the same Chat or email path.
 */
import type { Card } from "./cards";
import { hrefOf } from "./card-links";
import type { Role } from "./org";
import type { Notice, Recipient } from "./purchases/notices";
import { waitingOn as purchaseWaitingOn } from "./purchases/reminders";
import { STAGE_LABEL as PURCHASE_STEP } from "./purchases/types";
import { STAGE_LABEL as MARKETING_STEP } from "./marketing/types";
import { STATUS_LABEL as TICKET_STEP } from "./tickets/types";
import { reviewersFor } from "./events/workflow";
import { TEAM_ROLE } from "./tickets/workflow";
import { lc } from "./text";

const DAY = 864e5;

/** The history line a reminder from this page leaves on the request. */
export const REMINDER_ACTION = "Reminder sent from What's stuck";
/** One reminder from this page per request per day. */
export const REMIND_EVERY_MS = DAY;

type Entry = { at: string; by: string; action: string; note?: string };

/** The request's own history, whatever kind it is. */
function historyOf(card: Card): Entry[] {
  return card.purchase?.history ?? card.event?.history ?? card.marketing?.history ?? card.ticket?.history ?? [];
}

/** Reminders (the daily job's and this page's) don't move a request on, so they don't restart its wait. */
const isReminder = (e: Entry) => /^(reminder|overdue)/i.test(e.action) || e.action === REMINDER_ACTION;

/**
 * When the request started waiting at its current step (an ISO time): the
 * module's own "since" for the step, or, for a request sent back to its
 * requester or waiting on their close-out, the last thing that happened to it.
 */
export function waitingSince(card: Card): string {
  const step = card.purchase?.stageSince ?? card.event?.stageSince ?? card.marketing?.stageSince ?? card.ticket?.statusSince;
  if (card.status === "changes_requested" || card.status === "close_out") {
    const last = historyOf(card).filter((e) => !isReminder(e)).map((e) => e.at).sort().pop();
    if (last && (!step || last > step)) return last;
  }
  return step ?? card.updatedAt;
}

/** Whole days since `since`, never below zero. */
export function daysSince(since: string, now: string): number {
  return Math.max(0, Math.floor((Date.parse(now) - Date.parse(since)) / DAY));
}

export type Holder = {
  /** Who gets the reminder. Empty when this page can't remind anyone (the daily job handles it). */
  to: Recipient[];
  /** The step it's at, in words ("Chair approval"). */
  step: string;
};

export type StuckContext = {
  /** An event committee's directors (lib/events/context.ts). */
  directorsOf?: (committeeGroup: string) => string[];
};

const OWNER = (c: Card): Recipient => ({ email: c.ownerEmail });

/** Who the request is waiting on and at which step. Null when it isn't waiting on anyone (done, approved, closed). */
export function holderOf(card: Card, ctx: StuckContext = {}): Holder | null {
  if (["denied", "cancelled", "closed", "draft"].includes(card.status)) return null;
  if (card.purchase) {
    const p = card.purchase;
    if (card.status === "changes_requested") return { to: [OWNER(card)], step: "Back with the requester" };
    if (p.stage === "chair" && !p.approverEmail) return { to: [], step: PURCHASE_STEP.chair };
    const who = purchaseWaitingOn(card as Parameters<typeof purchaseWaitingOn>[0]);
    // QuickBooks entry is the finance office's batch work: not "stuck", same as the daily job.
    return who ? { to: [who], step: PURCHASE_STEP[p.stage] } : null;
  }
  if (card.event) {
    const e = card.event;
    if (card.status === "changes_requested") return { to: [OWNER(card)], step: e.releasedFor ? "Picking a new time" : "Back with the requester" };
    if (card.status === "close_out") return { to: [OWNER(card)], step: "Close-out" };
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
      default:
        return null;
    }
  }
  if (card.marketing) {
    const m = card.marketing;
    switch (m.stage) {
      case "review":
      case "scheduled":
        return { to: [{ role: "marketing" }], step: MARKETING_STEP[m.stage] };
      case "doing":
        return { to: [m.assignee ? { email: m.assignee } : { role: "marketing" }], step: MARKETING_STEP.doing };
      case "question":
        return { to: [OWNER(card)], step: MARKETING_STEP.question };
      default:
        return null;
    }
  }
  if (card.ticket) {
    const t = card.ticket;
    if (["closed", "cancelled"].includes(t.status)) return null;
    if (t.status === "resolved") return { to: [OWNER(card)], step: "Fixed: waiting for the reporter to confirm" };
    return { to: [t.assigneeEmail ? { email: t.assigneeEmail } : { role: TEAM_ROLE[t.team] }], step: TICKET_STEP[t.status] };
  }
  return null;
}

export type StuckItem = { card: Card; since: string; days: number; holder: Holder };

/** Every request that's waiting on someone, longest wait first. */
export function stuckItems(cards: Card[], now: string, ctx: StuckContext = {}): StuckItem[] {
  const seen = new Set<string>();
  const out: StuckItem[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    const holder = holderOf(card, ctx);
    if (!holder) continue;
    const since = waitingSince(card);
    out.push({ card, since, days: daysSince(since, now), holder });
  }
  return out.sort((a, b) => a.since.localeCompare(b.since) || a.card.id.localeCompare(b.card.id));
}

export type AgeGroup = "week" | "days" | "recent";
export const AGE_LABEL: Record<AgeGroup, string> = { week: "Over a week", days: "3–7 days", recent: "Under 3 days" };

/** "Over a week" is 7 days or more; "3–7 days" is 3 to 6 whole days. */
export function ageGroup(days: number): AgeGroup {
  return days >= 7 ? "week" : days >= 3 ? "days" : "recent";
}

/** The items in their three groups, each still longest wait first. */
export function groupByAge(items: StuckItem[]): Record<AgeGroup, StuckItem[]> {
  const g: Record<AgeGroup, StuckItem[]> = { week: [], days: [], recent: [] };
  for (const i of items) g[ageGroup(i.days)].push(i);
  return g;
}

/** When this page last sent a reminder for the request, or null. */
export function lastReminder(card: Card): string | null {
  return historyOf(card).filter((e) => e.action === REMINDER_ACTION).map((e) => e.at).sort().pop() ?? null;
}

/** A reminder can go when there's someone to remind and none was sent from this page in the last day. */
export function canRemind(item: Pick<StuckItem, "card" | "holder">, now: string): boolean {
  if (item.holder.to.length === 0) return false;
  const last = lastReminder(item.card);
  return !last || Date.parse(now) - Date.parse(last) >= REMIND_EVERY_MS;
}

/** How a role reads in "Waiting on …". */
const ROLE_WHO: Partial<Record<Role, string>> = {
  finance: "the finance office",
  executive: "an executive",
  marketing: "the marketing team",
  it: "IT Services",
  av: "IT Services",
  facilities: "Facility Maintenance",
  office: "the IAR office",
  security: "Safety & Security",
  sw: "Social & Welfare",
  admins: "the portal admins",
};

/** "Sample Director", "the finance office", "Sample Chair or Sample Vice Chair". */
export function whoWaiting(to: Recipient[], names: (email: string) => string): string {
  const ns = to.map((r) => ("email" in r ? names(r.email) : ROLE_WHO[r.role] ?? r.role));
  return ns.length > 1 ? `${ns.slice(0, -1).join(", ")} or ${ns[ns.length - 1]}` : ns[0] ?? "nobody yet";
}

/** The request as notices and Chat name it: Social & Welfare purchases never show their title. */
export function reminderLabel(card: Card): string {
  return card.purchase?.restricted ? `${card.id} (Social & Welfare request)` : `${card.id} “${card.title}”`;
}

const daysText = (n: number) => (n === 0 ? "since today" : `${n} day${n === 1 ? "" : "s"}`);

/**
 * The reminder: one alert per person or team it's waiting on (Chat, or email
 * when Chat can't reach them), the same kind of notice the daily job sends.
 * Approvals pass to whoever covers for someone who's away. The sender never
 * reminds themselves.
 */
export function reminderNotices(item: StuckItem, by: { email: string; name: string }): Notice[] {
  const href = hrefOf(item.card) ?? "/";
  const waited = item.days === 0 ? "is waiting" : `has waited ${daysText(item.days)}`;
  const text = `Reminder from ${by.name}: ${reminderLabel(item.card)} ${waited} for ${item.holder.step.toLowerCase()}. Could you take a look?`;
  return item.holder.to
    .filter((r) => !("email" in r) || lc(r.email) !== lc(by.email))
    .map((to) => ({ to, cardId: item.card.id, href, text, alert: true, delegable: "email" in to }));
}

/**
 * The card with the reminder in its history, as it should be saved. updatedAt
 * stays: a reminder isn't a change anyone needs to reload for, and it keeps
 * the request's place in everyone's lists.
 */
export function withReminder(card: Card, by: string, now: string, who: string): Card {
  const entry: Entry = { at: now, by: lc(by), action: REMINDER_ACTION, note: `To ${who}` };
  if (card.purchase) return { ...card, purchase: { ...card.purchase, history: [...card.purchase.history, entry] } };
  if (card.event) return { ...card, event: { ...card.event, history: [...card.event.history, entry] } };
  if (card.marketing) return { ...card, marketing: { ...card.marketing, history: [...card.marketing.history, entry] } };
  if (card.ticket) return { ...card, ticket: { ...card.ticket, history: [...card.ticket.history, entry] } };
  return card;
}

/** The roles that can open What's stuck. */
export const STUCK_ROLES: Role[] = ["office", "executive", "admins"];
export const mayOpenStuck = (roles: readonly Role[]) => roles.some((r) => STUCK_ROLES.includes(r));
