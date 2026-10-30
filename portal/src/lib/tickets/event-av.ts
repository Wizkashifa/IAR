/**
 * An approved event's A/V, as tickets for IT Services (docs/plan.md, "The
 * event card"). When an event that asked for A/V gets its final approval, IT
 * gets one ticket per date (a weekly series gets one for each week), due
 * that day, on its IT & Maintenance board like any other ticket. The event
 * is the parent; each ticket shows the event's A/V needs.
 *
 * - The ticket belongs to the event's requester, who follows it and hears
 *   when it's done. Marking it done closes it: nobody needs to confirm.
 * - When the event is cancelled or declined, its open tickets are cancelled.
 *   A date given up cancels that date's ticket; a new date gets one. A/V no
 *   longer asked for cancels them; A/V asked for later adds them.
 * - When the event's time, rooms, name, A/V needs or notes change, its open
 *   tickets are brought up to date and whoever has each one hears about it.
 * - An older event that still has its A/V task gets no tickets.
 *
 * Plain functions so they can be tested; the event's server actions call
 * them and save what they return (lib/events/linked-sync.ts).
 */
import type { Notice, Recipient } from "../notices";
import { AV_INCLUDES, AV_KINDS } from "../events/input";
import { dayText, timeText } from "../events/series";
import { type EventCard, eventChanges } from "../events/workflow";
import { andList } from "../text";
import { historyEntry } from "../workflow-core";
import { type TicketCard, SYSTEM, cancelWithEvent, followEvent, isOpen, newTicket } from "./workflow";

/** IT's A/V people: the event's A/V goes to them. */
const AV: Recipient = { role: "av" };

/** A room's name from its ID (the event stores IDs; the ticket shows names). */
export type RoomName = (id: string) => string;

const live = (e: EventCard) => e.status === "approved" || e.status === "close_out";

/** Whether this ticket is one of the event's A/V tickets. */
export const isAvTicketOf = (card: TicketCard, eventId: string) => card.ticket.kind === "event" && card.ticket.eventCardId === eventId;

/** What the ticket says about the event: its title, room and what's asked for, read from the event. */
export function avFields(event: EventCard, date: string, roomName: RoomName): { title: string; room: string; equipment?: string; description: string } {
  const e = event.event;
  const kinds = (e.avNeeds?.kinds ?? []).map((k) => AV_KINDS[k] ?? k);
  const includes = (e.avNeeds?.includes ?? []).map((k) => AV_INCLUDES[k] ?? k);
  const description = [
    `For ${event.id} “${event.title}” (${e.committeeName}), ${dayText(date)}, ${timeText(e.start)}–${timeText(e.end)}.`,
    `A/V asked for: ${kinds.length ? kinds.join(", ") : "support"}.`,
    includes.length ? `It includes: ${includes.join(", ")}.` : "",
    e.teamNotes?.trim() ? `Notes for the teams: ${e.teamNotes.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    title: `A/V: ${event.title} · ${dayText(date)}`,
    room: e.rooms.map(roomName).join(", ") || "Off-site",
    equipment: kinds.length ? kinds.join(", ") : undefined,
    description,
  };
}

/** The ticket for one date of the event, owned by the event's requester. The store assigns the ID. */
export function avTicket(event: EventCard, date: string, roomName: RoomName, now: string): TicketCard {
  const f = avFields(event, date, roomName);
  const requester = { email: event.ownerEmail, name: event.event.agreed?.name || event.ownerEmail };
  const card = newTicket({ team: "it", kind: "event", title: f.title, room: f.room, equipment: f.equipment, urgency: "normal", description: f.description }, requester, now);
  const t = card.ticket;
  // newTicket's first line says the requester reported it; this one says where it came from.
  return { ...card, ticket: { ...t, dueDate: date, eventCardId: event.id, eventDate: date, history: [historyEntry(SYSTEM, now, `Opened for ${event.id} “${event.title}”`)] } };
}

/** Whoever has an open ticket: its assignee, or A/V. */
const holderOf = (c: TicketCard): Recipient => (c.ticket.assigneeEmail ? { email: c.ticket.assigneeEmail } : AV);

export type AvChange = { create: TicketCard[]; update: TicketCard[]; notices: Notice[] };

/** What changed that A/V cares about, beyond the dates (each date has its own ticket). */
function avChanges(before: EventCard, after: EventCard): string[] {
  const out = eventChanges(before, after).filter((c) => c === "the time" || c.startsWith("the room") || c === "the name");
  const a = before.event;
  const b = after.event;
  if (JSON.stringify(a.avNeeds ?? null) !== JSON.stringify(b.avNeeds ?? null)) out.push("what A/V is asked for");
  if ((a.teamNotes ?? "") !== (b.teamNotes ?? "")) out.push("the notes for the teams");
  return out;
}

/** Open tickets cancelled, with why; whoever already has one gets an alert, a ticket nobody took just leaves the board. */
function cancelAll(tickets: TicketCard[], now: string, why: string, because: string): Pick<AvChange, "update" | "notices"> {
  return {
    update: tickets.map((t) => cancelWithEvent(t, now, why)),
    notices: tickets.map((t) => ({ to: holderOf(t), cardId: t.id, href: `/it-maintenance/${t.id}`, text: `${t.id} “${t.title}” is cancelled: ${because}. Nothing more to do.`, alert: Boolean(t.ticket.assigneeEmail), delegable: false })),
  };
}

/**
 * The event's A/V tickets after it changed: tickets to create, tickets to
 * save, and who hears about it. `tickets`: the tickets linked to the event.
 */
export function avTicketsAfterEventChange(before: EventCard | null, after: EventCard, tickets: TicketCard[], roomName: RoomName, now: string): AvChange {
  const out: AvChange = { create: [], update: [], notices: [] };
  if (!before) return out;
  const mine = tickets.filter((t) => isAvTicketOf(t, after.id));
  const open = mine.filter((t) => isOpen(t.ticket));
  const what = `${after.id} “${after.title}”`;

  // Cancelled or declined: every open ticket goes.
  if ((after.status === "cancelled" || after.status === "denied") && before.status !== after.status) {
    const how = after.status === "cancelled" ? "cancelled" : "declined";
    return { create: [], ...cancelAll(open, now, `The event was ${how}.`, `${what} was ${how}`) };
  }
  if (!live(after)) return out;
  // An older event works its A/V task instead.
  if (after.event.tasks?.some((t) => t.team === "av")) return out;

  const wanted = after.event.av ? after.event.dates : [];
  // Dates no longer on the event (or A/V no longer asked for): their open tickets go.
  const gone = open.filter((t) => !wanted.includes(t.ticket.eventDate ?? ""));
  if (gone.length) {
    const r = after.event.av ? cancelAll(gone, now, `${after.id} no longer takes place on this date.`, `${what} no longer takes place on that date`) : cancelAll(gone, now, `${after.id} no longer needs A/V.`, `${what} no longer needs A/V`);
    out.update.push(...r.update);
    out.notices.push(...r.notices);
  }
  // Dates with no ticket yet (one cancelled earlier doesn't count; one already done does): a ticket each.
  const have = new Set(mine.filter((t) => t.ticket.status !== "cancelled").map((t) => t.ticket.eventDate));
  const add = wanted.filter((d) => !have.has(d));
  out.create.push(...add.map((d) => avTicket(after, d, roomName, now)));
  if (add.length) {
    const approved = !live(before);
    const n = add.length;
    out.notices.push({
      to: AV,
      cardId: after.id,
      href: "/it-maintenance?view=team",
      text: `${what} ${approved ? "is approved" : "changed"}: ${n === 1 ? "a new A/V ticket" : `${n} new A/V tickets, one per date`}, ${n === 1 ? "on" : "first on"} ${dayText(add[0])}.`,
      alert: true,
      delegable: false,
    });
  }

  // The time, rooms, name, A/V needs or notes changed: the open tickets that stay are brought up to date.
  const changes = avChanges(before, after);
  if (changes.length) {
    const note = `The event changed ${andList(changes)}.`;
    for (const t of open.filter((x) => !gone.includes(x))) {
      out.update.push(followEvent(t, avFields(after, t.ticket.eventDate ?? t.ticket.dueDate ?? "", roomName), now, note));
      out.notices.push({ to: holderOf(t), cardId: t.id, href: `/it-maintenance/${t.id}`, text: `${what} changed ${andList(changes)}. Check that ${t.id} “${t.title}” still fits.`, alert: true, delegable: false });
    }
  }
  return out;
}

/**
 * A portal admin deleted the event: its open tickets are cancelled (whoever
 * has one hears about it) and none points at it any more. Closed tickets keep
 * their place in lists.
 */
export function avTicketsOnEventDeleted(event: EventCard, tickets: TicketCard[], now: string): Pick<AvChange, "update" | "notices"> {
  const mine = tickets.filter((t) => isAvTicketOf(t, event.id));
  const cancelled = cancelAll(mine.filter((t) => isOpen(t.ticket)), now, `${event.id} was deleted by a portal admin.`, `${event.id} “${event.title}” was deleted`);
  const unlink = (t: TicketCard): TicketCard => ({ ...t, ticket: { ...t.ticket, eventCardId: undefined } });
  return { update: [...cancelled.update.map(unlink), ...mine.filter((t) => !isOpen(t.ticket)).map(unlink)], notices: cancelled.notices };
}

/** Events still in review that asked for A/V: they bring A/V tickets once they're approved. */
export const avComing = (events: EventCard[]) => events.filter((e) => (e.status === "submitted" || e.status === "in_review" || e.status === "changes_requested") && e.event.av).length;
