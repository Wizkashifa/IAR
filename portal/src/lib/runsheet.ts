/**
 * The daily run sheet: one printable page of what's happening where on a day,
 * for one campus. Approved events (and ones in close-out) come from the
 * portal with everything the office and facilities need; the other
 * entries on the room calendars (bookings made in Google Calendar, prayers
 * and school hours included) are listed too, marked as calendar entries.
 * Plain functions so they can be tested.
 */
import { AV_KINDS } from "./events/input";
import { type Room, roomById } from "./events/rooms";
import { type BusyItem, isAfterHours } from "./events/rules";
import { fromMinutes, toMinutes } from "./events/series";
import type { EventCard } from "./events/workflow";

export type RunSheetEvent = {
  kind: "event";
  cardId: string;
  title: string;
  committee: string;
  /** The requester's email. */
  contact: string;
  /** The room hold, with setup and cleanup. */
  start: string;
  end: string;
  eventStart: string;
  eventEnd: string;
  setup: number;
  teardown: number;
  rooms: string[];
  attendance: number;
  setupNotes: string;
  /** What A/V was asked for, or "". */
  av: string;
  /** For the front desk: open to the public, food, a large crowd. */
  notes: string[];
  afterHours: boolean;
  series: boolean;
  closeOut: boolean;
};

export type RunSheetEntry = {
  kind: "calendar";
  title: string;
  start: string;
  end: string;
  rooms: string[];
  afterHours: boolean;
};

export type RunSheetRow = RunSheetEvent | RunSheetEntry;

/** The campuses (Google's buildings) that have rooms, in order. */
export function campusesOf(rooms: Room[]): string[] {
  return [...new Set(rooms.map((r) => r.building || "Other rooms"))].sort();
}

const inCampus = (rooms: Room[], id: string, campus?: string) => {
  const r = roomById(rooms, id);
  return Boolean(r) && (!campus || (r!.building || "Other rooms") === campus);
};

/** What the front desk should know about an event. After hours shows as its own flag. */
export function eventNotes(card: EventCard): string[] {
  const e = card.event;
  const out: string[] = [];
  if (e.isPublic) out.push("Open to the public.");
  if (e.outsideSpeaker) out.push("Outside speaker or guest.");
  if (e.food) out.push("Food served.");
  if (e.attendance >= 100) out.push("Large crowd: help with parking.");
  return out;
}

/** The day's rows for one campus (or every room), by time. */
export function runSheetRows(events: EventCard[], busy: BusyItem[], rooms: Room[], date: string, campus?: string): RunSheetRow[] {
  const nameOf = (id: string) => roomById(rooms, id)?.name ?? id;
  const out: RunSheetRow[] = [];
  for (const c of events) {
    const e = c.event;
    if (!(c.status === "approved" || c.status === "close_out") || !e.dates.includes(date)) continue;
    const here = e.rooms.filter((id) => inCampus(rooms, id, campus));
    if (!here.length) continue;
    out.push({
      kind: "event",
      cardId: c.id,
      title: e.title,
      committee: e.committeeName,
      contact: c.ownerEmail,
      start: fromMinutes(toMinutes(e.start) - e.setup),
      end: fromMinutes(toMinutes(e.end) + e.teardown),
      eventStart: e.start,
      eventEnd: e.end,
      setup: e.setup,
      teardown: e.teardown,
      rooms: here.map(nameOf),
      attendance: e.attendance,
      setupNotes: e.setupNotes.trim(),
      av: e.av ? (e.avNeeds?.kinds ?? []).map((k) => AV_KINDS[k] ?? k).join(", ") || "A/V support" : "",
      notes: eventNotes(c),
      afterHours: isAfterHours(e),
      series: e.dates.length > 1,
      closeOut: c.status === "close_out",
    });
  }

  // Calendar entries the portal didn't make: one row per entry, with every room it's on.
  const entries = new Map<string, RunSheetEntry>();
  for (const b of busy) {
    if (b.date !== date || b.cardId || b.kind === "pending" || !inCampus(rooms, b.roomId, campus)) continue;
    const key = `${b.eventId ?? b.label}|${b.label}|${b.start}|${b.end}`;
    const have = entries.get(key);
    const room = nameOf(b.roomId);
    if (have) {
      if (!have.rooms.includes(room)) have.rooms.push(room);
      continue;
    }
    entries.set(key, { kind: "calendar", title: b.label, start: b.start, end: b.end, rooms: [room], afterHours: toMinutes(b.end) > 22 * 60 || toMinutes(b.start) < 7 * 60 });
  }
  // The same entry on several room calendars (a hall and its halves) shows once.
  const seen = new Map<string, RunSheetEntry>();
  for (const x of entries.values()) {
    const k = `${x.title}|${x.start}|${x.end}`;
    const have = seen.get(k);
    if (have) have.rooms.push(...x.rooms.filter((r) => !have.rooms.includes(r)));
    else seen.set(k, x);
  }
  out.push(...seen.values());

  return out.sort((a, b) => a.start.localeCompare(b.start) || (a.kind === b.kind ? 0 : a.kind === "event" ? -1 : 1) || a.title.localeCompare(b.title));
}
