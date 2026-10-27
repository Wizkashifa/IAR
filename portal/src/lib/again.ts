/**
 * "Request this again": a new request filled in from a past or finished one,
 * so last year's Family Night or this month's cleaning supplies take a minute.
 * Only what the person asked for is copied. Status, approvals, history,
 * receipts, payments, IDs and dates already gone are never copied. Plain
 * functions so they can be tested; the request pages and the new-request
 * pages call them.
 */
import type { Card } from "./cards";
import type { EventInput } from "./events/types";
import { MARKETING_TYPES, type MarketingInput } from "./marketing/forms";
import type { MarketingDetails } from "./marketing/types";
import type { PurchaseInput } from "./purchases/input";
import type { PurchaseDetails } from "./purchases/types";
import { addDays } from "./dates";

const DAY = 86_400_000;
const toDay = (ymd: string) => Date.parse(`${ymd}T12:00:00Z`);

/** Requests that are over: done, paid, closed, declined or withdrawn. */
const OVER = ["paid", "closed", "close_out", "denied", "cancelled"];

/**
 * Whether this request can be copied into a new one: it's over (or the event
 * has happened), and the person asked for it or chairs its committee.
 */
export function canRequestAgain(card: Card, viewer: { email: string; teams?: { group: string; name: string; role: string }[] }, today: string): boolean {
  if (card.type !== "event" && card.type !== "purchase" && card.type !== "marketing") return false;
  // Card receipts come from each month's statement: there's nothing to copy.
  if (card.purchase?.kind === "card") return false;
  const over =
    OVER.includes(card.status) ||
    (card.event != null && card.status === "approved" && lastDate(card.event) < today) ||
    (card.purchase != null && (card.purchase.stage === "books" || card.purchase.stage === "done")) ||
    (card.marketing != null && ["done", "declined", "cancelled"].includes(card.marketing.stage));
  if (!over) return false;
  if (card.ownerEmail.toLowerCase() === viewer.email.toLowerCase()) return true;
  const leads = (viewer.teams ?? []).filter((t) => t.role === "chair" || t.role === "vice");
  if (card.event) return leads.some((t) => t.group.toLowerCase() === card.event!.committeeGroup.toLowerCase());
  return Boolean(card.committee) && leads.some((t) => t.name === card.committee);
}

const lastDate = (e: { date: string; recur?: { until: string } }) => e.recur?.until || e.date;

/**
 * A date for the copy, on the same weekday as the original. An event from
 * about a year ago or more is probably yearly, so it moves on by whole years
 * (52 weeks). Anything more recent gets the first same weekday at least three
 * weeks out, the lead time the event form starts with.
 */
export function suggestDate(original: string, today: string): string {
  if (!original) return addDays(today, 21);
  if (toDay(original) <= toDay(today) - 180 * DAY) {
    let d = original;
    while (toDay(d) < toDay(today) + 14 * DAY) d = addDays(d, 364);
    return d;
  }
  const earliest = addDays(today, 21);
  const shift = (new Date(toDay(original)).getUTCDay() - new Date(toDay(earliest)).getUTCDay() + 7) % 7;
  return addDays(earliest, shift);
}

/** An event to request again: everything the requester said, on a new date. */
export function eventAgain(e: EventInput, today: string): EventInput {
  return {
    title: e.title,
    description: e.description,
    committeeGroup: e.committeeGroup,
    committeeName: e.committeeName,
    date: suggestDate(e.date, today),
    start: e.start,
    end: e.end,
    setup: e.setup,
    teardown: e.teardown,
    // A repeating event repeats again, until a date the person picks.
    recur: e.recur ? { freq: e.recur.freq, until: "" } : undefined,
    rooms: [...e.rooms],
    attendance: e.attendance,
    budget: e.budget,
    food: e.food,
    isPublic: e.isPublic,
    registration: e.registration,
    av: e.av,
    setupNotes: e.setupNotes,
    newProgram: false,
    outsideSpeaker: e.outsideSpeaker,
    fundraiser: e.fundraiser,
    brief: e.brief ? { subtitle: e.brief.subtitle, text: e.brief.text, flyer: e.brief.flyer, regLink: e.brief.regLink, payment: e.brief.payment, final: false } : undefined,
    avNeeds: e.avNeeds ? { kinds: [...e.avNeeds.kinds], includes: [...e.avNeeds.includes], ack: false } : undefined,
    teamNotes: e.teamNotes,
  };
}

/**
 * A purchase to request again: who's paid, the fund and the sub-account
 * lines with their amounts (to change as needed). No receipts, invoice
 * number, card month or link to the old event; the person signs again, and
 * a reimbursement pays whoever asks this time.
 */
export function purchaseAgain(p: PurchaseDetails): PurchaseInput {
  return {
    kind: p.kind,
    fund: p.fund,
    description: p.description,
    // A reimbursement pays whoever asks this time, so the old payee isn't copied.
    payee: p.kind === "reimburse" ? undefined : p.payee,
    delivery: p.delivery,
    mailingAddress: p.mailingAddress,
    isLabor: p.isLabor,
    relatedParty: p.relatedParty,
    lines: p.lines.map((l) => ({
      accountId: l.accountId,
      amount: l.amount.toFixed(2),
      note: l.note ?? "",
      date: "",
      merchant: l.merchant ?? "",
      flag: "",
      repayBy: "",
    })),
    attestationName: "",
  };
}

/** A marketing request to ask for again: the same type and answers, without dates already gone. */
export function marketingAgain(m: MarketingDetails, committee: string, today: string): MarketingInput {
  const dates = new Set((MARKETING_TYPES[m.kind]?.fields ?? []).filter((f) => f.kind === "date").map((f) => f.key));
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(m.answers)) answers[k] = dates.has(k) && v < today ? "" : v;
  return { kind: m.kind, answers, committee, driveLink: m.driveLink, notes: m.notes };
}

/** The note at the top of a copied form. */
export const copiedNote = (id: string) => `Copied from ${id}. Check the dates and details before sending.`;
