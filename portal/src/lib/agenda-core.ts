/**
 * What's booked where, and which rooms are free: the plain functions behind
 * the home page's "Today at IAR", the calendar's week and month views, and
 * "Find a room". Times are "HH:MM" in Raleigh. lib/agenda.ts reads the room
 * calendars and event requests and passes them in here.
 *
 * The room rules aren't repeated here: clashes come from findClashes (which
 * already knows that MPH A&B covers MPH A and MPH B), the cleaning gap from
 * eventChecks, and every rule can be turned off in Portal Settings (ruleOn).
 */
import { type Room, roomById } from "./events/rooms";
import { type BusyItem, eventChecks, findClashes, ruleOn } from "./events/rules";
import { eventDates, toMinutes } from "./events/series";
import type { EventInput, Recurrence } from "./events/types";
import type { EventCard } from "./events/workflow";

/** Where an entry came from: a portal request, or anything else on the IAR calendar (prayers and school hours included). */
export type AgendaSource = "portal" | "calendar";

export type AgendaItem = {
  key: string;
  date: string;
  /** The event's own times. For a portal request, without setup and cleanup. */
  start: string;
  end: string;
  title: string;
  source: AgendaSource;
  /** A portal request still waiting for approval holds its room as "pending". */
  pending: boolean;
  roomIds: string[];
  rooms: string[];
  cardId?: string;
  committee?: string;
  /** The room is held this long, setup and cleanup included (portal requests). */
  holdStart?: string;
  holdEnd?: string;
};

/** The parts of an event request the agenda shows. */
export type AgendaCard = Pick<EventCard, "id" | "status"> & { event: Pick<EventCard["event"], "title" | "committeeName" | "start" | "end"> };

/**
 * One list of entries from the room calendars, one per event per date. An
 * entry on several room calendars (a hall and its halves) shows once with
 * every room. Portal holds take the request's title and times when the
 * request is known. Sorted by date, then time.
 */
export function agendaFrom(busy: BusyItem[], rooms: Room[], cards: AgendaCard[] = []): AgendaItem[] {
  const byCard = new Map(cards.map((c) => [c.id, c]));
  const out = new Map<string, AgendaItem>();
  for (const b of busy) {
    const card = b.cardId ? byCard.get(b.cardId) : undefined;
    const key = b.cardId ? `${b.date}|card:${b.cardId}` : `${b.date}|${b.label}|${b.start}|${b.end}`;
    const room = roomById(rooms, b.roomId);
    const have = out.get(key);
    if (have) {
      if (!have.roomIds.includes(b.roomId)) {
        have.roomIds.push(b.roomId);
        have.rooms.push(room?.name ?? b.roomId);
      }
      continue;
    }
    out.set(key, {
      key,
      date: b.date,
      start: card ? card.event.start : b.start,
      end: card ? card.event.end : b.end,
      title: card ? card.event.title : b.label,
      source: b.cardId ? "portal" : "calendar",
      pending: b.kind === "pending",
      roomIds: [b.roomId],
      rooms: [room?.name ?? b.roomId],
      ...(b.cardId ? { cardId: b.cardId, holdStart: b.start, holdEnd: b.end } : {}),
      ...(card ? { committee: card.event.committeeName } : {}),
    });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

/** What someone needs a room for. Setup and cleanup default to 30 minutes, as on the event form. */
export type RoomNeed = {
  date: string;
  start: string;
  end: string;
  setup?: number;
  cleanup?: number;
  attendance: number;
  food?: boolean;
  /** A building (the room's `building`); empty means every campus. */
  campus?: string;
  recur?: Recurrence;
};

export type RoomOption = {
  room: Room;
  /** Free and allowed for this need. */
  ok: boolean;
  /** Why it isn't, in a few plain words each ("Too small for 80"). Empty when ok. */
  reasons: string[];
  /** Worth knowing even when it's free (the MPH cleaning gap). */
  notes: string[];
};

export type FreeRoomsContext = {
  /** Portal Settings' rule switches (settings.eventRules). */
  rules: Partial<Record<string, boolean>>;
  /** Chairs, the office, the executive, directors and admins (mayBookRestricted in lib/events/context.ts). */
  mayBookRestricted: boolean;
};

/** "6–8 PM", "11:30 AM–1 PM". */
export function rangeText(start: string, end: string): string {
  const part = (hhmm: string) => {
    const m = toMinutes(hhmm), h = Math.floor(m / 60), min = m % 60;
    return { t: `${h % 12 || 12}${min ? `:${String(min).padStart(2, "0")}` : ""}`, ap: h >= 12 ? "PM" : "AM" };
  };
  const s = part(start), e = part(end);
  return s.ap === e.ap ? `${s.t}–${e.t} ${e.ap}` : `${s.t} ${s.ap}–${e.t} ${e.ap}`;
}

/** A request for one room, so the event rules can be asked about it. */
function probe(need: RoomNeed, roomId: string): EventInput {
  return {
    title: "",
    description: "",
    committeeGroup: "",
    committeeName: "",
    date: need.date,
    start: need.start,
    end: need.end,
    setup: need.setup ?? 30,
    teardown: need.cleanup ?? 30,
    ...(need.recur ? { recur: need.recur } : {}),
    rooms: [roomId],
    attendance: need.attendance,
    budget: 0,
    food: Boolean(need.food),
    isPublic: false,
    registration: false,
    av: false,
    setupNotes: "",
    newProgram: false,
    outsideSpeaker: false,
    fundraiser: false,
    teamNotes: "",
  };
}

/**
 * Every bookable room (on the campus, if one is given), each marked free or
 * not with its reasons. Free rooms come first: those with nothing to note,
 * then the snuggest fit, so a group of 20 is offered Room 250 before the gym.
 * `busy` must cover the need's dates on the rooms' calendars and the
 * calendars of rooms that share their space (roomsToCheck).
 */
export function freeRoomsFrom(need: RoomNeed, rooms: Room[], busy: BusyItem[], ctx: FreeRoomsContext): RoomOption[] {
  if (toMinutes(need.end) <= toMinutes(need.start)) return [];
  const dates = eventDates(need.date, need.recur);
  const many = dates.length > 1;
  const options = rooms
    .filter((r) => r.bookable && (!need.campus || (r.building || "") === need.campus))
    .map((room): RoomOption => {
      const reasons: string[] = [];
      const notes: string[] = [];
      const input = probe(need, room.id);
      for (const c of findClashes(input, rooms, busy)) {
        const what = c.kind === "pending" ? "Requested" : "Booked";
        const on = many ? ` (${c.dates.length} of ${dates.length} dates)` : "";
        // One entry on several rooms' calendars (the gym and its halves) is one reason.
        const why = `${what} ${rangeText(c.start, c.end)}: ${c.label}${on}`;
        if (!reasons.includes(why)) reasons.push(why);
      }
      if (ruleOn(ctx.rules, "capacity") && room.capacity && need.attendance > room.capacity) reasons.push(`Too small for ${need.attendance} (holds ${room.capacity})`);
      if (need.food && ruleOn(ctx.rules, "food") && !room.food) reasons.push("No food allowed");
      if (room.restricted && ruleOn(ctx.rules, "restricted") && !ctx.mayBookRestricted) reasons.push("Leadership, imams and chairs only");
      if (!reasons.length) {
        // The cleaning gap is a flag for reviewers, not a block, so the room stays free with a note.
        const gap = eventChecks(input, { rooms, busy, today: need.date, rules: ctx.rules, mayBookRestricted: true }).checks;
        for (const c of gap) if (c.sev === "warn" && c.text.startsWith("Less than 2 hours")) notes.push(c.text);
        if (room.note) notes.push(room.note);
      }
      return { room, ok: reasons.length === 0, reasons, notes };
    });
  const fit = (o: RoomOption) => (o.room.capacity ? o.room.capacity - need.attendance : Number.MAX_SAFE_INTEGER);
  return options.sort(
    (a, b) =>
      Number(b.ok) - Number(a.ok) ||
      a.notes.length - b.notes.length ||
      a.reasons.length - b.reasons.length ||
      fit(a) - fit(b) ||
      a.room.name.localeCompare(b.room.name),
  );
}
