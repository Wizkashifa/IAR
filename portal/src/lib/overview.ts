/**
 * Right now, at the top of Portal measures (app/measures): the whole
 * portal at a glance for IAR's executives. What's waiting and for how long, the money this month, this
 * week's events, the building and IT tickets, and how long requests take now.
 * Plain functions over cards the page has already loaded; nothing here
 * changes a request.
 */
import type { Card, CardType } from "./cards";
import { addDays } from "./dates";
import type { EventCard } from "./events/workflow";
import { KINDS } from "./kinds";
import { median } from "./measures";
import { shortFund } from "./purchases/accounts";
import { purchaseTotal } from "./purchases/types";
import type { PurchaseCard } from "./purchases/workflow";
import type { StuckItem } from "./stuck";
import type { TicketTeam } from "./tickets/types";
import { isOverdue, type TicketCard } from "./tickets/workflow";

const DAY = 864e5;
const cents = (n: number) => Math.round(n * 100) / 100;

/* ---- What's waiting ---------------------------------------------------- */

export type KindWaiting = { type: CardType; label: string; path: string; open: number; overWeek: number; oldestDays: number };

/** For each kind of request: how many are waiting on someone, how many for over a week, and the longest wait. */
export function waitingByKind(items: StuckItem[]): KindWaiting[] {
  return KINDS.map((k) => {
    const mine = items.filter((i) => i.card.type === k.type);
    return {
      type: k.type,
      label: k.many,
      path: k.path,
      open: mine.length,
      overWeek: mine.filter((i) => i.days > 7).length,
      oldestDays: mine.reduce((m, i) => Math.max(m, i.days), 0),
    };
  });
}

/* ---- Money ------------------------------------------------------------- */

export type Money = {
  paid: number;
  paidCount: number;
  toPay: number;
  toPayCount: number;
  inReview: number;
  inReviewCount: number;
  /** Paid this month by committee, largest first. */
  byCommittee: { name: string; total: number }[];
};

/**
 * Payments and reimbursements (card receipts are already spent, so they're
 * counted from the statement instead): paid this month (YYYY-MM), approved
 * and waiting to be paid, and still in review.
 */
export function moneyThisMonth(purchases: PurchaseCard[], month: string): Money {
  const real = purchases.filter((c) => c.purchase.kind !== "card" && c.status !== "cancelled" && c.status !== "denied");
  const paid = real.filter((c) => c.purchase.payment?.at.slice(0, 7) === month);
  const toPay = real.filter((c) => c.purchase.stage === "payment");
  const inReview = real.filter((c) => c.status === "in_review" || c.status === "submitted");
  const sum = (xs: PurchaseCard[]) => cents(xs.reduce((s, c) => s + purchaseTotal(c.purchase), 0));
  const by = new Map<string, number>();
  for (const c of paid) {
    const name = shortFund(c.purchase.fund);
    by.set(name, (by.get(name) ?? 0) + purchaseTotal(c.purchase));
  }
  return {
    paid: sum(paid),
    paidCount: paid.length,
    toPay: sum(toPay),
    toPayCount: toPay.length,
    inReview: sum(inReview),
    inReviewCount: inReview.length,
    byCommittee: [...by].map(([name, total]) => ({ name, total: cents(total) })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
  };
}

/* ---- This week --------------------------------------------------------- */

export type WeekEvent = { card: EventCard; date: string; approved: boolean };

/**
 * Events on a date from today through the next 6 days, approved or still in
 * review, each on its first date in the week, soonest first.
 */
export function eventsThisWeek(events: EventCard[], today: string): WeekEvent[] {
  const last = addDays(today, 6);
  const out: WeekEvent[] = [];
  for (const card of events) {
    const approved = card.status === "approved" || card.status === "close_out";
    if (!approved && card.status !== "in_review" && card.status !== "submitted") continue;
    const date = card.event.dates.find((d) => d >= today && d <= last);
    if (date) out.push({ card, date, approved });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.card.event.start.localeCompare(b.card.event.start));
}

/* ---- Building and IT --------------------------------------------------- */

export type TicketHealth = { team: TicketTeam; open: number; nobody: number; late: number; urgent: number };

const OPEN_TICKET = new Set(["new", "assigned", "in_progress", "waiting_parts", "reopened"]);

/** Each team's open tickets: how many, how many nobody has, how many are late, and how many are high or urgent. */
export function ticketHealth(tickets: TicketCard[], now: Date, today: string): TicketHealth[] {
  return (["facilities", "it"] as TicketTeam[]).map((team) => {
    const open = tickets.filter((c) => c.ticket.team === team && OPEN_TICKET.has(c.ticket.status));
    return {
      team,
      open: open.length,
      nobody: open.filter((c) => !c.ticket.assigneeEmail).length,
      late: open.filter((c) => isOverdue(c, now, today)).length,
      urgent: open.filter((c) => c.ticket.urgency === "urgent" || c.ticket.urgency === "high").length,
    };
  });
}

/* ---- How long things take now ------------------------------------------ */

export type Turnaround = { days: number | null; count: number };

const sentAt = (c: Card) => c.createdAt ?? c.updatedAt;
const medianDays = (ms: number[]): number | null => (ms.length ? Math.round((median(ms) / DAY) * 10) / 10 : null);

/** The typical (median) days from sending a payment request to its payment, for those paid in the last `days` days. */
export function paymentTurnaround(purchases: PurchaseCard[], now: Date, days = 90): Turnaround {
  const since = now.getTime() - days * DAY;
  const ms = purchases
    .filter((c) => c.purchase.kind !== "card" && c.purchase.payment && Date.parse(c.purchase.payment.at) >= since)
    .map((c) => Date.parse(c.purchase.payment!.at) - Date.parse(sentAt(c)))
    .filter((x) => x >= 0);
  return { days: medianDays(ms), count: ms.length };
}

/** The typical (median) days from sending an event request to its final approval, for those approved in the last `days` days. */
export function eventTurnaround(events: EventCard[], now: Date, days = 90): Turnaround {
  const since = now.getTime() - days * DAY;
  const ms: number[] = [];
  for (const c of events) {
    const last = c.event.approvals.at(-1);
    const approved = c.event.stage === "approved" || c.event.stage === "done";
    if (!approved || !last || Date.parse(last.at) < since) continue;
    const d = Date.parse(last.at) - Date.parse(sentAt(c));
    if (d >= 0) ms.push(d);
  }
  return { days: medianDays(ms), count: ms.length };
}

/** "3.5 days", "under a day", or "not enough yet". */
export function daysText(t: Turnaround): string {
  if (t.days === null) return "Not enough yet";
  if (t.days < 1) return "Under a day";
  return `${t.days} day${t.days === 1 ? "" : "s"}`;
}


