import "server-only";
import { type RoomCalendar, roomCalendar, seedDevCalendar } from "../calendar";
import { type Card, cardStore } from "../cards";
import { isDevAuth } from "../dev";
import { actorFor } from "../people";
import { directory } from "../groups";
import { portalSettings } from "../portal-settings";
import { googleRooms } from "../rooms-google";
import { type Directory, teamPeople } from "../teams";
import type { Viewer } from "../viewer";
import { type Room, mergeRooms, roomsToCheck } from "./rooms";
import type { BusyItem } from "./rules";
import { eventDates, todayInRaleigh } from "./series";
import type { EventInput } from "./types";
import { canOpenEvent } from "./access";
import { type EventChoice, linkableEvents } from "./link";
import { type SlotRequest, canDecide } from "./slot-requests";
import { slotRequestStore } from "./slot-requests-store";
import { type EventActor, isEventCard } from "./workflow";

/**
 * What every events page and action needs, put together from places nobody
 * edits by hand here: Google Groups (committees and directors), Google's room
 * resources and calendars, and Portal Settings (bookable rooms, rules).
 */
export type EventContext = {
  dir: Directory;
  rooms: Room[];
  /** Rooms the form offers. */
  bookable: Room[];
  rules: Record<string, boolean>;
  calendar: RoomCalendar;
  today: string;
  directorsOf: (committeeGroup: string) => string[];
};

export async function eventContext(): Promise<EventContext> {
  const [dir, settings, google] = await Promise.all([directory(), portalSettings(), googleRooms()]);
  const rooms = mergeRooms(google, settings.rooms ?? {});
  const today = todayInRaleigh();
  if (isDevAuth()) seedDevCalendar(rooms, today);
  return {
    dir,
    rooms,
    bookable: rooms.filter((r) => r.bookable),
    rules: settings.eventRules ?? {},
    calendar: roomCalendar(),
    today,
    directorsOf: (g) => teamPeople(dir, g).directors,
  };
}

/** What's on the calendars of the request's rooms (and rooms sharing their space) on its dates. */
export async function busyFor(ctx: EventContext, input: Pick<EventInput, "rooms" | "date" | "recur">): Promise<BusyItem[]> {
  const cals = roomsToCheck(input.rooms, ctx.rooms).map((r) => ({ roomId: r.id, calendarId: r.calendarId }));
  if (!cals.length) return [];
  const dates = eventDates(input.date, input.recur);
  if (!dates.length) return [];
  const dateSet = new Set(dates);
  return (await ctx.calendar.listBusy(cals, dates[0], dates[dates.length - 1])).filter((b) => dateSet.has(b.date));
}

/** The committees this person can request events for: their teams and the ones they direct. The office and admins can pick any. */
export function committeesFor(viewer: Viewer, dir: Directory): { group: string; name: string }[] {
  const nameOf = (g: string) => dir.teams.find((t) => t.email === g)?.name ?? g;
  const all = viewer.actingRoles.includes("office") || viewer.actingRoles.includes("admins");
  const groups = all ? dir.teams.map((t) => t.email) : [...viewer.teams.map((t) => t.group), ...viewer.directs];
  return [...new Set(groups)].map((group) => ({ group, name: nameOf(group) })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Room 240 and other restricted rooms: chairs, the office, the executive and admins. */
export const mayBookRestricted = (viewer: Viewer) => viewer.actingRoles.some((r) => r === "chairs" || r === "office" || r === "executive" || r === "admins") || viewer.directs.length > 0;

/** Events this person may link a purchase request to: their own approved ones (and ones in close-out), and their committees' upcoming approved events. */
export async function linkableEventsFor(viewer: Viewer): Promise<EventChoice[]> {
  const cards = (await (await cardStore()).listByType("event", ["approved", "close_out"])).filter(isEventCard);
  return linkableEvents(cards, { email: viewer.email, groups: viewer.teams.map((t) => t.group) }, todayInRaleigh());
}

export const eventActor = (viewer: Viewer): EventActor => ({ email: viewer.email.toLowerCase(), name: viewer.name, roles: viewer.actingRoles });

/**
 * Who is looking at an event and whether they may open it: the page, its
 * title and the comment action all check the same way. Asks for this event's
 * time (or from it) are loaded once, since the page shows them too.
 */
export async function eventAccess(card: Card, viewer: Viewer) {
  const slots = await slotRequestStore();
  const [actor, fromAsks, onAsks] = await Promise.all([actorFor(viewer), slots.listFromCard(card.id), slots.listForHold(`card:${card.id}`)]);
  const ev = eventActor(viewer);
  const asks: SlotRequest[] = [...onAsks, ...fromAsks.filter((a) => !onAsks.some((o) => o.id === a.id))];
  const deciding = asks.some((a) => canDecide(a, ev));
  const open = canOpenEvent(card, { ...actor, seeAll: viewer.roles.includes("admins") }, deciding);
  return { actor, ev, asks, open };
}
