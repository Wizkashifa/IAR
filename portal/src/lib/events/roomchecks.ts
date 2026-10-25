/**
 * Security's room check before and after an event (room policy: security
 * checks the room before and after). Recorded per date on the event card,
 * from the run sheet or the event page. A problem goes to the requester and
 * the IAR office; an OK room tells nobody. Recording the check also moves
 * that date's security task along. Plain functions so they can be tested.
 */
import type { Notice } from "../purchases/notices";
import { dayText } from "./series";
import { TaskError, worksTeam } from "./tasks";
import type { EventHistoryEntry, EventTask, RoomCheck } from "./types";
import type { EventActor, EventCard } from "./workflow";
import { lc } from "../text";

export const WHEN_LABEL: Record<RoomCheck["when"], string> = { before: "Before", after: "After" };

const entry = (by: string, at: string, action: string, note?: string): EventHistoryEntry => (note ? { at, by: lc(by), action, note } : { at, by: lc(by), action });

/** Security records room checks; the office can too, when security asks them to. */
export const mayCheckRooms = (actor: Pick<EventActor, "roles">) => worksTeam("security", actor.roles);

export type RoomCheckInput = { date: string; when: RoomCheck["when"]; ok: boolean; note?: string };

/** The recorded check for one date and time, if any. */
export const roomCheckFor = (card: EventCard, date: string, when: RoomCheck["when"]) => (card.event.roomChecks ?? []).find((r) => r.date === date && r.when === when);

/** Record (or correct) a room check. A problem needs a note saying what's wrong. */
export function recordRoomCheck(card: EventCard, actor: EventActor, now: string, input: RoomCheckInput): EventCard {
  if (!mayCheckRooms(actor)) throw new TaskError("Only security (or the IAR office) records room checks.");
  if (card.status !== "approved" && card.status !== "close_out" && card.status !== "closed") throw new TaskError("Room checks are for approved events.");
  if (!card.event.rooms.length) throw new TaskError("This event is off-site: there's no room to check.");
  if (!card.event.dates.includes(input.date)) throw new TaskError("That isn't one of this event's dates.");
  if (input.when !== "before" && input.when !== "after") throw new TaskError("Say whether this is the check before or after the event.");
  const note = (input.note ?? "").trim().slice(0, 1000);
  if (!input.ok && !note) throw new TaskError("Say what the problem is.");
  const check: RoomCheck = { date: input.date, when: input.when, ok: input.ok, ...(note ? { note } : {}), by: lc(actor.email), at: now };
  const prior = roomCheckFor(card, input.date, input.when);
  const roomChecks = [...(card.event.roomChecks ?? []).filter((r) => !(r.date === input.date && r.when === input.when)), check].sort((a, b) => a.date.localeCompare(b.date) || (a.when === b.when ? 0 : a.when === "before" ? -1 : 1));
  const what = `Room check ${input.when} the event (${dayText(input.date)}): ${input.ok ? "OK" : "problem"}${prior ? " (corrected)" : ""}`;

  // The date's security task: in progress after the check before, done after the check after.
  const tasks = (card.event.tasks ?? []).map((t): EventTask => {
    if (t.team !== "security" || t.date !== input.date || t.status === "locked") return t;
    const status = input.when === "after" ? "done" : t.status === "todo" ? "doing" : t.status;
    if (status === t.status) return t;
    return { ...t, status, assignee: t.assignee ?? lc(actor.email), ...(status === "done" ? { note: input.ok ? "Room OK after the event" : `Problem after the event: ${note}` } : {}), history: [...t.history, entry(actor.email, now, status === "done" ? "Done (room check after)" : "Started (room check before)")] };
  });
  return {
    ...card,
    event: { ...card.event, roomChecks, ...(card.event.tasks ? { tasks } : {}), history: [...card.event.history, entry(actor.email, now, what, note || undefined)] },
    updatedAt: now,
  };
}

/** A problem goes to the requester (in the portal) and the IAR office (an alert: they follow up). An OK room tells nobody. */
export function roomCheckNotices(card: EventCard, actor: EventActor, input: RoomCheckInput): Notice[] {
  if (input.ok) return [];
  const text = `${card.id} “${card.title}”: security found a problem with the room ${input.when} the event on ${dayText(input.date)}: “${(input.note ?? "").trim().slice(0, 200)}”`;
  const out: Notice[] = [{ to: { role: "office" }, cardId: card.id, href: `/events/${card.id}#roomchecks`, text, alert: true, delegable: false }];
  if (lc(card.ownerEmail) !== lc(actor.email)) out.push({ to: { email: card.ownerEmail }, cardId: card.id, href: `/events/${card.id}#roomchecks`, text, alert: false, delegable: false });
  return out;
}
