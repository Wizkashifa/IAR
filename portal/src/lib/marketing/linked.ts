/**
 * Marketing pieces linked to an event (docs/plan.md, "Marketing for an
 * event"). Each piece is a marketing request of kind "event" with
 * `eventCardId`: a flyer, posts, a video, a banner… The event is the parent;
 * the piece reads the event's title, dates, brief and images from the event
 * and never copies them.
 *
 * - The event's requester, their committee's chair, vice chair or director,
 *   and the marketing team can add pieces once the event is submitted: while
 *   it's in review (long lead times) or approved. Not to a draft, a declined,
 *   cancelled or finished event.
 * - The piece belongs to the event's requester, so whatever comes back to the
 *   requester goes to them. Its history says who added it.
 * - When a public event gets its final approval and has no pieces yet, the
 *   portal adds one, "Flyer and announcement". Only once.
 * - When the event is cancelled or declined, its open pieces are cancelled.
 *   When its date, time, rooms or details change, whoever has each open piece
 *   hears about it; the piece stays where it is.
 * - A series has one set of pieces for the whole series.
 *
 * Plain functions so they can be tested; the event's server actions call
 * them and save what they return (lib/marketing/pieces.ts).
 */
import type { CardStatus } from "../cards";
import type { Notice } from "../notices";
import { type EventCard, firstDate } from "../events/workflow";
import { dayText } from "../events/series";
import { addDays, todayLocal } from "../dates";
import { andList, same } from "../text";
import { historyEntry, type Permission } from "../workflow-core";
import { PIECE_LEAD_DAYS, eventPartOf, piecePartOf, pieceTitle, type ParsedMarketing } from "./forms";
import { OPEN_STAGES, cancelWithEvent, isWorkStage, newMarketing, teamContact, type Actor, type MarketingCard } from "./workflow";

/** What a piece's page and row say while its event isn't approved yet. */
export const EVENT_NOT_APPROVED = "Event not approved yet";

/** Event statuses a piece can be added in: submitted, in review (or sent back for changes) and approved. */
const ADDABLE: CardStatus[] = ["submitted", "in_review", "changes_requested", "approved"];

/** Whether a piece should say "Event not approved yet": its event is still in review or sent back. */
export const waitsOnEvent = (event: EventCard | null | undefined) => Boolean(event && (event.status === "submitted" || event.status === "in_review" || event.status === "changes_requested"));

/** Whether this card is a piece of marketing linked to the event. */
export const isPieceOf = (card: MarketingCard, eventId: string) => card.marketing.eventCardId === eventId;

/**
 * Whether `actor` may add a piece of marketing to the event now: its
 * requester, the chairs, vice chairs and director of its committee
 * (`actor.leads`), or anyone on the marketing team.
 */
export function mayAddPiece(event: EventCard, actor: Pick<Actor, "email" | "roles" | "leads">): Permission {
  const committee = event.event.committeeGroup.toLowerCase();
  const who = same(event.ownerEmail, actor.email) || actor.roles.includes("marketing") || Boolean(actor.leads?.some((g) => g.toLowerCase() === committee));
  if (!who) return { ok: false, reason: "Only the event's requester, their committee's chair or director, and the marketing team can add marketing to an event." };
  if (!ADDABLE.includes(event.status)) {
    if (event.status === "draft") return { ok: false, reason: "Send the event request first. Then you can add its marketing." };
    if (event.status === "close_out" || event.status === "closed") return { ok: false, reason: "This event is over, so it can't get new marketing." };
    return { ok: false, reason: "This event was cancelled or declined, so it can't get marketing." };
  }
  return { ok: true };
}

/** The needed-by date the form suggests: 10 days before the event's first date, and never before today. */
export function suggestedDue(event: EventCard, today: string): string {
  const d = addDays(firstDate(event), -PIECE_LEAD_DAYS);
  return d < today ? today : d;
}

/** The event's requester, as the piece's owner. */
const ownerOf = (event: EventCard): Actor => ({ email: event.ownerEmail, name: event.event.agreed?.name || event.ownerEmail, roles: [] });

/** A piece for the event from checked form input (or the portal's own), owned by the event's requester. The store assigns the ID. */
function buildPiece(event: EventCard, details: Omit<ParsedMarketing, "kind" | "committee">, title: string, by: string, action: string, now: string): MarketingCard {
  const c = newMarketing({ ...details, kind: "event", committee: event.event.committeeName }, ownerOf(event), now);
  // newMarketing's first line is "Submitted" by the owner; the piece says who added it instead (and keeps any short-notice line).
  const history = [historyEntry(by, now, action), ...c.marketing.history.slice(1)];
  return { ...c, title, marketing: { ...c.marketing, eventCardId: event.id, history } };
}

/** A piece someone adds from the event's page. The caller checks mayAddPiece first. */
export function newPiece(event: EventCard, details: ParsedMarketing, actor: Actor, now: string): MarketingCard {
  const { kind: _kind, committee: _committee, ...rest } = details;
  return buildPiece(event, rest, pieceTitle(details.answers.piece, event.title), actor.email, `Added for ${event.id} “${event.title}”`, now);
}

/**
 * The piece the portal adds when a public event gets its final approval
 * (`before` wasn't approved, `after` is) and nothing is linked to it yet: a
 * flyer and announcement, due 10 days before the event. An older event that
 * still has its Marketing task doesn't get one. Null when none is needed.
 */
export function autoPiece(before: EventCard | null, after: EventCard, pieces: MarketingCard[], now: string): MarketingCard | null {
  if (!after.event.isPublic || after.status !== "approved" || before?.status === "approved") return null;
  if (pieces.length > 0) return null;
  if (after.event.tasks?.some((t) => t.team === "marketing")) return null;
  const answers = {
    piece: "flyer",
    desc: "A flyer and an announcement for the newsletter, website and lobby screens, from the event's marketing brief.",
    due: suggestedDue(after, todayLocal(new Date(now))),
  };
  return buildPiece(after, { answers }, `Flyer and announcement: ${after.title}`, "Portal", `Added when ${after.id} was approved`, now);
}

/** What changed on the event that marketing cares about, in words ("the date and the time"). */
export function eventChanges(before: EventCard, after: EventCard): string[] {
  const a = before.event;
  const b = after.event;
  const out: string[] = [];
  if (a.dates.join() !== b.dates.join()) out.push(b.dates.length > 1 ? "the dates" : "the date");
  if (a.start !== b.start || a.end !== b.end) out.push("the time");
  if (a.rooms.join() !== b.rooms.join()) out.push(b.rooms.length > 1 ? "the rooms" : "the room");
  if (before.title !== after.title) out.push("the name");
  if (a.description !== b.description || JSON.stringify(a.brief ?? null) !== JSON.stringify(b.brief ?? null) || a.isPublic !== b.isPublic) out.push("the details");
  return out;
}

/**
 * The event's pieces after it changed, and who hears about it. Returns only
 * the pieces that changed (to save) and the notices to deliver.
 * - Cancelled or declined: open pieces are cancelled, with why in their history.
 * - Date, time, rooms, name or details changed on an event still in review or
 *   approved: whoever has each open piece gets an alert. A new name is put in
 *   the piece's title. The stage doesn't change.
 */
export function piecesAfterEventChange(before: EventCard | null, after: EventCard, pieces: MarketingCard[], now: string): { pieces: MarketingCard[]; notices: Notice[] } {
  const open = pieces.filter((p) => isPieceOf(p, after.id) && OPEN_STAGES.includes(p.marketing.stage));
  const out: { pieces: MarketingCard[]; notices: Notice[] } = { pieces: [], notices: [] };
  if (!before || open.length === 0) return out;
  const what = `${after.id} “${after.title}”`;
  const notice = (p: MarketingCard, text: string, alert: boolean): Notice => ({ to: teamContact(p), cardId: p.id, href: `/marketing/${p.id}`, text, alert, delegable: false });

  const ended = after.status === "cancelled" || after.status === "denied";
  if (ended && before.status !== after.status) {
    const how = after.status === "cancelled" ? "cancelled" : "declined";
    return cancelPieces(open, now, `The event was ${how}.`, `${what} was ${how}`);
  }
  if (ended || !ADDABLE.includes(after.status)) return out;

  const changes = eventChanges(before, after);
  if (changes.length === 0) return out;
  const renamed = before.title !== after.title;
  const when = after.event.dates.length ? ` It's now on ${after.event.dates.length > 1 ? `${after.event.dates.length} dates from ` : ""}${dayText(firstDate(after))}.` : "";
  for (const p of open) {
    if (renamed && eventPartOf(p.title) === before.title) {
      out.pieces.push({ ...p, title: `${piecePartOf(p.title)}: ${after.title}`, updatedAt: now });
    }
    out.notices.push(notice(p, `${what} changed ${andList(changes)}.${changes.some((c) => c.startsWith("the date")) ? when : ""} Check that ${p.id} “${p.title}” still fits.`, true));
  }
  return out;
}

/**
 * Open pieces cancelled because their event ended (`why` for their history,
 * `because` for the notice). Whoever already scheduled, started or sent a
 * draft gets an alert to stop; a piece nobody picked up just leaves the
 * team's list with a note.
 */
function cancelPieces(open: MarketingCard[], now: string, why: string, because: string): { pieces: MarketingCard[]; notices: Notice[] } {
  return {
    pieces: open.map((p) => cancelWithEvent(p, now, why)),
    notices: open.map((p) => ({ to: teamContact(p), cardId: p.id, href: `/marketing/${p.id}`, text: `${p.id} “${p.title}” is cancelled: ${because}. Nothing more to do.`, alert: isWorkStage(p.marketing.stage), delegable: false })),
  };
}

/**
 * A portal admin deleted the event: its open pieces are cancelled (whoever
 * has them hears about it, as when an event is cancelled), and every piece
 * stops pointing at it. Pieces already closed keep their place in lists.
 */
export function piecesOnEventDeleted(event: EventCard, pieces: MarketingCard[], now: string): { pieces: MarketingCard[]; notices: Notice[] } {
  const open = pieces.filter((p) => isPieceOf(p, event.id) && OPEN_STAGES.includes(p.marketing.stage));
  const cancelled = cancelPieces(open, now, `${event.id} was deleted by a portal admin.`, `${event.id} “${event.title}” was deleted`);
  const unlink = (p: MarketingCard): MarketingCard => ({ ...p, marketing: { ...p.marketing, eventCardId: undefined } });
  const closed = pieces.filter((p) => isPieceOf(p, event.id) && !OPEN_STAGES.includes(p.marketing.stage));
  return { pieces: [...cancelled.pieces.map(unlink), ...closed.map(unlink)], notices: cancelled.notices };
}

/** The requester hears when someone else adds a piece to their event (in the portal; nothing to do yet). */
export function pieceAddedNotices(piece: MarketingCard, actor: Pick<Actor, "email" | "name">): Notice[] {
  if (same(piece.ownerEmail, actor.email)) return [];
  return [
    {
      to: { email: piece.ownerEmail },
      cardId: piece.id,
      href: `/marketing/${piece.id}`,
      text: `${actor.name || actor.email} asked marketing for ${piece.id} “${piece.title}” for your event ${piece.marketing.eventCardId}. It's in your requests.`,
      alert: false,
      delegable: false,
    },
  ];
}
