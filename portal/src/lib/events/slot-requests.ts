/**
 * Asking for a booked time slot. When an event request clashes with another
 * IAR booking, the requester can ask whoever holds it to give it up. Plain
 * functions over the request so they can be tested; pages and server actions
 * call these and never change a request's status themselves.
 *
 * Rules:
 * - Nobody asks for their own booking.
 * - One open ask per booking and date. Once the holder keeps a date, it can't
 *   be asked for again.
 * - A recurring series is asked for date by date: only the clashing dates.
 * - The holder (the booking's owner, with their committee's chair and vice
 *   chair) can give the dates up and move their event, give them up and
 *   cancel, or keep them. A calendar entry with no portal card has no owner
 *   on the portal, so the IAR office answers for it (with whoever made it, if
 *   they're at IAR); it can only be given up or kept.
 * - Giving dates up frees them on the calendar at once. A moved event goes
 *   to the pillar director only, then straight to approved.
 * - No answer: a reminder after 3 days, and after 6 the ask goes to the
 *   pillar director over the holder's committee (the executive when there is
 *   none), who can decide for them. After 10 days, or once the requester's
 *   event is less than a week away, the ask closes ("expired") and the
 *   request goes back to the requester to pick another time, so it never
 *   waits forever. Nothing is ever given up automatically.
 * - Every step is written to the request's history.
 */
import { ORG, type Role } from "../org";
import type { Notice, Recipient } from "../notices";
import { type Directory, teamPeople } from "../teams";
import { addDays } from "../dates";
import { dayText, timeText } from "./series";
import { lc, plural, same } from "../text";

/** What the requester's room check clashed with. */
export type Hold = {
  kind: "booking" | "pending";
  /** Shown to people: "Youth Weekly Halaqa", "Zuhr prayer". */
  label: string;
  room: string;
  /** "HH:MM", including setup and cleanup. */
  start: string;
  end: string;
  /** The portal card holding it. Unset for an entry made straight on the calendar. */
  cardId?: string;
  ownerEmail?: string;
  /** The team group of the card's committee. */
  committeeGroup?: string;
  calendarEventId?: string;
  /** The room calendar the entry is on, to free given-up dates of a calendar-only entry. */
  calendarId?: string;
  /** For a calendar-only entry: who made it. */
  organizerEmail?: string;
  /** Every date the holder's booking has: one for a one-time event. */
  seriesDates: string[];
};

export type SlotChoice = "release_move" | "release_cancel" | "keep";
export type SlotStatus = "open" | "escalated" | "released" | "kept" | "withdrawn" | "expired";

export type SlotHistoryEntry = { at: string; by: string; text: string };

export type SlotRequest = {
  id: string;
  /** The requester's event card. */
  fromCard: string;
  requesterEmail: string;
  requesterName: string;
  hold: Omit<Hold, "kind"> & { pending: boolean };
  /** "card:EV-1031" or "cal:<calendar event id>", for finding asks on the same booking. */
  holdKey: string;
  /** The dates asked for, sorted. */
  dates: string[];
  reason: string;
  /** Who was asked: emails, or "role:office". */
  askedOf: string[];
  /** Who it went to when nobody answered. */
  escalatedTo?: string[];
  /** Everyone who may decide (askedOf plus escalatedTo), so a store can list someone's waiting asks. */
  deciders: string[];
  status: SlotStatus;
  choice?: SlotChoice;
  decidedBy?: string;
  note?: string;
  askedAt: string;
  remindedAt?: string;
  escalatedAt?: string;
  updatedAt: string;
  history: SlotHistoryEntry[];
};

export type SlotActor = { email: string; name: string; roles: Role[] };

/**
 * Days before a reminder, before the ask goes up to the director, and before
 * it closes with no answer. `closeBeforeEvent`: it also closes once the
 * requester's event is this many days away, leaving time to pick another.
 */
export type SlotTiming = { remindDays: number; escalateDays: number; expireDays: number; closeBeforeEvent: number };
export const SLOT_TIMING: SlotTiming = { remindDays: 3, escalateDays: 6, expireDays: 10, closeBeforeEvent: 7 };

export const SLOT_STATUS_LABEL: Record<SlotStatus, string> = {
  open: "Waiting for an answer",
  escalated: "Waiting for the director",
  released: "Given up",
  kept: "Kept",
  withdrawn: "Withdrawn",
  expired: "No answer in time",
};

export const CHOICE_LABEL: Record<SlotChoice, string> = {
  release_move: "Give it up and move my event",
  release_cancel: "Give it up and cancel those dates",
  keep: "Keep it",
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const OPEN: SlotStatus[] = ["open", "escalated"];
export const isOpenAsk = (r: SlotRequest) => OPEN.includes(r.status);

export function holdKeyOf(h: Pick<Hold, "cardId" | "calendarEventId">): string {
  if (h.cardId) return `card:${h.cardId}`;
  if (h.calendarEventId) return `cal:${h.calendarEventId}`;
  return "";
}

/** "Tue, Nov 4" or "Tue, Nov 4 and 2 more dates". */
export function datesText(dates: string[]): string {
  if (!dates.length) return "";
  const more = dates.length - 1;
  return more ? `${dayText(dates[0])} and ${plural(more, "more date")}` : dayText(dates[0]);
}

const OFFICE = "role:office";

/** A booking made straight on the calendar: nobody owns it on the portal. */
export const offPortal = (hold: Pick<Hold, "cardId">) => !hold.cardId;

/**
 * Who the ask goes to: the card's owner and their committee's chairs. A
 * calendar entry made outside the portal has no owner here, so the IAR
 * office answers for it, along with whoever made it if they're at IAR.
 */
function askTargets(hold: Hold, dir: Directory, requesterEmail: string): string[] {
  const out = new Set<string>();
  if (hold.cardId && hold.ownerEmail) {
    out.add(lc(hold.ownerEmail));
    if (hold.committeeGroup) {
      const p = teamPeople(dir, hold.committeeGroup);
      for (const e of [...p.chairs, ...p.vices]) out.add(e);
    }
  } else {
    out.add(OFFICE);
    if (hold.organizerEmail && lc(hold.organizerEmail).endsWith(`@${ORG.domain}`)) out.add(lc(hold.organizerEmail));
  }
  out.delete(lc(requesterEmail));
  return out.size ? [...out] : [OFFICE];
}

/** Who decides when nobody answers: the pillar director over the holder's committee, else the executive. */
export function escalationTargets(req: SlotRequest, dir: Directory): string[] {
  const directors = req.hold.committeeGroup ? teamPeople(dir, req.hold.committeeGroup).directors : [];
  const usable = directors.filter((d) => !same(d, req.hold.ownerEmail) && !same(d, req.requesterEmail));
  return usable.length ? usable : ["role:executive"];
}

/** Can this requester ask for these dates of this booking? */
export function checkAsk(hold: Hold, dates: string[], requesterEmail: string, existing: SlotRequest[]): { ok: true } | { ok: false; error: string } {
  if (!holdKeyOf(hold)) return { ok: false, error: "This booking isn't linked to a calendar entry, so there's nobody to ask. Ask the office." };
  if (same(hold.ownerEmail, requesterEmail) || (!hold.cardId && same(hold.organizerEmail, requesterEmail))) {
    return { ok: false, error: "This is your own booking. Change it from its request instead." };
  }
  if (!dates.length) return { ok: false, error: "Pick at least one date to ask for." };
  const notBooked = dates.filter((d) => !hold.seriesDates.includes(d));
  if (notBooked.length) return { ok: false, error: `${hold.label} isn't booked on ${datesText(notBooked)}.` };
  const key = holdKeyOf(hold);
  for (const r of existing) {
    if (r.holdKey !== key) continue;
    const overlap = r.dates.filter((d) => dates.includes(d));
    if (!overlap.length) continue;
    if (isOpenAsk(r)) return { ok: false, error: `${datesText(overlap)} already has an open ask (${r.id}). Wait for that answer.` };
    if (r.status === "kept") return { ok: false, error: `${r.hold.label} was kept on ${datesText(overlap)}. Pick another time.` };
  }
  return { ok: true };
}

export function newSlotRequest(
  input: { fromCard: string; requester: SlotActor; hold: Hold; dates: string[]; reason: string },
  dir: Directory,
  existing: SlotRequest[],
  now: string,
): Result<Omit<SlotRequest, "id">> {
  const { hold, requester } = input;
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Say why you need this time, so they can decide." };
  if (reason.length > 1000) return { ok: false, error: "Keep the reason under 1,000 characters." };
  const dates = [...new Set(input.dates)].sort();
  const check = checkAsk(hold, dates, requester.email, existing);
  if (!check.ok) return check;
  const { kind, ...rest } = hold;
  const askedOf = askTargets(hold, dir, requester.email);
  return {
    ok: true,
    value: {
      fromCard: input.fromCard,
      requesterEmail: lc(requester.email),
      requesterName: requester.name,
      hold: { ...rest, pending: kind === "pending" },
      holdKey: holdKeyOf(hold),
      dates,
      reason,
      askedOf,
      deciders: askedOf,
      status: "open",
      askedAt: now,
      updatedAt: now,
      history: [{ at: now, by: lc(requester.email), text: `Asked for ${hold.room}, ${datesText(dates)}, ${timeText(hold.start)}–${timeText(hold.end)}, held by ${hold.label}. Reason: ${reason}` }],
    },
  };
}

const addressed = (list: string[], actor: SlotActor) => list.some((a) => (a.startsWith("role:") ? actor.roles.includes(a.slice(5) as Role) : same(a, actor.email)));

/** Can this person answer the ask? The requester never can. The office can always answer for a booking made off the portal. */
export function canDecide(req: SlotRequest, actor: SlotActor): boolean {
  if (!isOpenAsk(req) || same(actor.email, req.requesterEmail)) return false;
  if (addressed(req.askedOf, actor)) return true;
  if (offPortal(req.hold) && actor.roles.includes("office")) return true;
  return req.status === "escalated" && addressed(req.escalatedTo ?? [], actor);
}

/** A change to Google Calendar, for the calendar code to carry out. */
export type CalendarOp =
  | { op: "delete"; eventId: string }
  | { op: "end_series"; eventId: string; lastDate: string }
  | { op: "cancel_occurrence"; eventId: string; date: string };

/** What happens to the holder's card. */
export type OwnerChange =
  | { action: "none" }
  /** Opened for editing; resubmitting goes to the director only (see resubmitStage). */
  | { action: "edit"; releasedFor: string; dates: string[] }
  | { action: "cancel" }
  | { action: "drop_dates"; dates: string[] };

/** What happens to the requester's card. */
export type RequesterChange =
  /** On to review as normal: director, then executive. */
  | { action: "to_review" }
  /** Back to the requester to pick another time. */
  | { action: "changes"; note: string };

export type SlotDecision = {
  request: SlotRequest;
  owner: OwnerChange;
  requester: RequesterChange;
  calendar: CalendarOp[];
};

/** Calendar changes that free these dates of the holder's booking. */
export function calendarOpsFor(hold: SlotRequest["hold"], dates: string[]): CalendarOp[] {
  const id = hold.calendarEventId;
  if (!id) return [];
  const all = [...hold.seriesDates].sort();
  const given = new Set(dates);
  if (all.every((d) => given.has(d))) return [{ op: "delete", eventId: id }];
  // Giving up the last dates of a series ends it early; anything else cancels those days only.
  const firstGiven = all.findIndex((d) => given.has(d));
  if (all.slice(firstGiven).every((d) => given.has(d))) return [{ op: "end_series", eventId: id, lastDate: all[firstGiven - 1] }];
  return all.filter((d) => given.has(d)).map((date) => ({ op: "cancel_occurrence", eventId: id, date }));
}

export function decide(req: SlotRequest, actor: SlotActor, choice: SlotChoice, note: string, now: string): Result<SlotDecision> {
  if (!canDecide(req, actor)) return { ok: false, error: "This ask is waiting on someone else." };
  if (choice === "release_move" && !req.hold.cardId) return { ok: false, error: "This booking was made on the calendar, not in the portal, so it can't be moved from here. Give it up or keep it." };
  note = note.trim();
  const forWhom = same(actor.email, req.hold.ownerEmail) || !req.hold.ownerEmail ? "" : ` on behalf of ${req.hold.ownerEmail}`;
  const as = req.status === "escalated" && addressed(req.escalatedTo ?? [], actor) && !addressed(req.askedOf, actor) ? " (no answer after the reminder, so decided by the director)" : "";
  const what = datesText(req.dates);
  const text =
    choice === "keep"
      ? `Kept ${what}${forWhom}${as}`
      : choice === "release_move"
        ? `Gave up ${what} for ${req.fromCard} (${req.requesterName})${forWhom}${as}. The event will be moved`
        : `Gave up ${what} for ${req.fromCard} (${req.requesterName})${forWhom}${as}. Those dates are cancelled`;
  const request: SlotRequest = {
    ...req,
    status: choice === "keep" ? "kept" : "released",
    choice,
    decidedBy: lc(actor.email),
    note: note || undefined,
    updatedAt: now,
    history: [...req.history, { at: now, by: lc(actor.email), text: note ? `${text}. Note: ${note}` : text }],
  };
  if (choice === "keep") {
    return { ok: true, value: { request, owner: { action: "none" }, requester: { action: "changes", note: note || `${req.hold.label} is keeping ${what}. Pick another time or room.` }, calendar: [] } };
  }
  const wholeBooking = req.hold.seriesDates.every((d) => req.dates.includes(d));
  const owner: OwnerChange = !req.hold.cardId
    ? { action: "none" }
    : choice === "release_move"
      ? { action: "edit", releasedFor: req.id, dates: req.dates }
      : wholeBooking
        ? { action: "cancel" }
        : { action: "drop_dates", dates: req.dates };
  return { ok: true, value: { request, owner, requester: { action: "to_review" }, calendar: calendarOpsFor(req.hold, req.dates) } };
}

/** The requester changed their mind. */
export function withdraw(req: SlotRequest, actor: SlotActor, now: string): Result<SlotRequest> {
  if (!isOpenAsk(req)) return { ok: false, error: "This ask has already been answered." };
  if (!same(actor.email, req.requesterEmail)) return { ok: false, error: "Only the person who asked can withdraw it." };
  return { ok: true, value: { ...req, status: "withdrawn", updatedAt: now, history: [...req.history, { at: now, by: lc(actor.email), text: "Withdrew the ask" }] } };
}

const daysSince = (iso: string, now: string) => (Date.parse(now) - Date.parse(iso)) / 864e5;

/** An ask about a booking made off the portal that the office wasn't asked about (asks made before the office answered for them). */
export const needsOffice = (req: SlotRequest) => isOpenAsk(req) && offPortal(req.hold) && !req.askedOf.includes(OFFICE);

/**
 * The day an unanswered ask closes: `expireDays` after it was asked, or
 * `closeBeforeEvent` days before the requester's event, whichever is first.
 * `eventDate`: the requester's event's first date ("YYYY-MM-DD").
 */
export function closesOn(req: Pick<SlotRequest, "askedAt">, eventDate?: string, timing: SlotTiming = SLOT_TIMING): string {
  const byAge = addDays(req.askedAt.slice(0, 10), timing.expireDays);
  const byEvent = eventDate ? addDays(eventDate, -timing.closeBeforeEvent) : byAge;
  return byEvent < byAge ? byEvent : byAge;
}

/** What a daily job should do with an unanswered ask. `today`: "YYYY-MM-DD" in Raleigh. */
export function followUp(req: SlotRequest, now: string, timing: SlotTiming = SLOT_TIMING, o: { eventDate?: string; today?: string } = {}): "office" | "expire" | "remind" | "escalate" | null {
  if (!isOpenAsk(req)) return null;
  if (needsOffice(req)) return "office";
  const age = daysSince(req.askedAt, now);
  if (age >= timing.expireDays || (o.today && o.today >= closesOn(req, o.eventDate, timing))) return "expire";
  if (req.status !== "open") return null;
  if (age >= timing.escalateDays) return "escalate";
  if (age >= timing.remindDays && !req.remindedAt) return "remind";
  return null;
}

/** An ask about a booking made off the portal goes to the office, who answer for it. */
export function routeToOffice(req: SlotRequest, now: string): SlotRequest {
  return {
    ...req,
    askedOf: [...req.askedOf, OFFICE],
    deciders: [...new Set([...req.deciders, OFFICE])],
    updatedAt: now,
    history: [...req.history, { at: now, by: "portal", text: `${req.hold.label} was booked on the IAR calendar, not in the portal, so the IAR office answers for it` }],
  };
}

/** Nobody answered in time: the ask closes, and the requester picks another time. Nothing is given up. */
export function expire(req: SlotRequest, now: string): SlotRequest {
  return { ...req, status: "expired", updatedAt: now, history: [...req.history, { at: now, by: "portal", text: "Closed: nobody answered in time. Nothing was given up" }] };
}

/** The note the requester's request goes back with when its ask closes unanswered. */
export const EXPIRED_NOTE = "Nobody answered your ask for the booked time in time. Pick another time or room.";

export function markReminded(req: SlotRequest, now: string): SlotRequest {
  return { ...req, remindedAt: now, updatedAt: now, history: [...req.history, { at: now, by: "portal", text: "Reminder sent: no answer yet" }] };
}

export function escalate(req: SlotRequest, dir: Directory, now: string): SlotRequest {
  const to = escalationTargets(req, dir);
  const who = to[0] === "role:executive" ? "the executive" : "the pillar director";
  return {
    ...req,
    status: "escalated",
    escalatedTo: to,
    escalatedAt: now,
    deciders: [...new Set([...req.askedOf, ...to])],
    updatedAt: now,
    history: [...req.history, { at: now, by: "portal", text: `No answer, so sent to ${who} to decide` }],
  };
}

/**
 * Where a resubmitted event card goes. A card moved to give up its slot
 * (`releasedFor` set) needs only the pillar director, and is approved
 * straight away when there is no director other than its owner.
 */
export function resubmitStage(card: { ownerEmail: string; releasedFor?: string }, directors: string[]): "director" | "mission" | "approved" {
  const reviewers = directors.filter((d) => !same(d, card.ownerEmail));
  if (reviewers.length) return "director";
  return card.releasedFor ? "approved" : "mission";
}

/** After the director approves: the executive next, unless the card was moved to give up its slot. */
export function afterDirector(card: { releasedFor?: string }): "mission" | "approved" {
  return card.releasedFor ? "approved" : "mission";
}

// ---- Notices ------------------------------------------------------------

const recipient = (a: string): Recipient => (a.startsWith("role:") ? { role: a.slice(5) as Role } : { email: a });

/** Who hears about a change to an ask, and whether they get an alert. Only people who have to act get one. */
export function slotNotices(before: SlotRequest | null, after: SlotRequest, actorEmail: string): Notice[] {
  const out: Notice[] = [];
  const add = (to: string, cardId: string, text: string, alert: boolean) => {
    if (same(to, actorEmail)) return;
    out.push({ to: recipient(to), cardId, href: `/events/${cardId}`, text, alert, delegable: alert });
  };
  const slot = `${after.hold.room}, ${datesText(after.dates)}, ${timeText(after.hold.start)}–${timeText(after.hold.end)}`;
  const holder = after.hold.cardId ?? after.fromCard;

  if (!before) {
    for (const a of after.askedOf) add(a, holder, `${after.requesterName} asks for ${slot}, held by ${after.hold.label}. Reason: ${after.reason}`, true);
    return out;
  }
  if (before.status === after.status && !before.remindedAt && after.remindedAt) {
    for (const a of after.askedOf) add(a, holder, `Reminder: ${after.requesterName} is waiting for your answer about ${slot}`, true);
    return out;
  }
  if (!before.askedOf.includes(OFFICE) && after.askedOf.includes(OFFICE) && before.status === after.status) {
    add(OFFICE, holder, `${after.requesterName} asks for ${slot}, held by ${after.hold.label}. It was booked on the IAR calendar, not in the portal, so the office answers for it. Reason: ${after.reason}`, true);
    return out;
  }
  if (after.status === "expired" && before.status !== "expired") {
    add(after.requesterEmail, after.fromCard, `Nobody answered your ask for ${slot} in time, so it closed. Pick another time or room.`, true);
    for (const a of after.deciders) add(a, holder, `${after.requesterName}'s ask for ${slot} closed with no answer. Nothing was given up.`, false);
    return out;
  }
  if (before.status === "open" && after.status === "escalated") {
    for (const a of after.escalatedTo ?? []) add(a, holder, `Nobody answered ${after.requesterName}'s ask for ${slot}, held by ${after.hold.label}. Please decide.`, true);
    for (const a of after.askedOf) add(a, holder, `${after.requesterName}'s ask for ${slot} went to the director, since nobody answered`, false);
    return out;
  }
  if (after.status === "released" && before.status !== "released") {
    add(after.requesterEmail, after.fromCard, `${after.hold.label} gave up ${slot}. Your request goes on to review.`, false);
    if (after.choice === "release_move" && after.hold.ownerEmail) add(after.hold.ownerEmail, holder, `Pick a new time for ${after.hold.label}. It needs only the director's approval.`, true);
    return out;
  }
  if (after.status === "kept" && before.status !== "kept") {
    add(after.requesterEmail, after.fromCard, `${after.hold.label} is keeping ${slot}${after.note ? `: ${after.note}` : ""}. Pick another time or room.`, true);
    return out;
  }
  if (after.status === "withdrawn" && before.status !== "withdrawn") {
    for (const a of after.deciders) add(a, holder, `${after.requesterName} withdrew the ask for ${slot}`, false);
  }
  return out;
}
