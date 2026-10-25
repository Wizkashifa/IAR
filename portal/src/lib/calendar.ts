import "server-only";
import { isDevAuth } from "./dev";
import { failed } from "./health";
import { delegatedToken } from "./google";
import { type BusyItem, isStandingTitle } from "./events/rules";
import { addDays, dayOfWeek, eventDates, fromMinutes, rrule, toMinutes, weekOfMonth } from "./events/series";
import type { CalendarOp } from "./events/slot-requests";
import type { HoldStatus, Recurrence } from "./events/types";

/**
 * IAR's room calendars in Google Calendar, the source of truth for bookings.
 * Each room resource has its own calendar, shared with the portal's mailbox
 * (PORTAL_CALENDAR_SUBJECT, default PORTAL_MAIL_FROM) with "Make changes to
 * events". The portal acts as that mailbox through keyless domain-wide
 * delegation (lib/google.ts) with the calendar.events scope. Setup:
 * docs/setup.md §10. In dev mode, a sample calendar is kept in memory.
 */

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const API = "https://www.googleapis.com/calendar/v3";
export const TIME_ZONE = "America/New_York";

/** A room's calendar to read. */
export type RoomCal = { roomId: string; calendarId: string };

/** The portal's entry for one event on one room's calendar. Times include setup and cleanup. */
export type HoldSpec = {
  cardId: string;
  summary: string;
  description: string;
  date: string;
  start: string;
  end: string;
  recur?: Recurrence;
  /** Dates of the series not held (given up). */
  except: string[];
  status: HoldStatus;
};

export interface RoomCalendar {
  /** Everything on these calendars from `from` to `to` (inclusive dates), one item per date. */
  listBusy(cals: RoomCal[], from: string, to: string): Promise<BusyItem[]>;
  /** Every date a calendar entry happens on between two dates (for asking about a series). */
  seriesDates(calendarId: string, eventId: string, from: string, to: string): Promise<string[]>;
  createHold(calendarId: string, h: HoldSpec): Promise<string>;
  updateHold(calendarId: string, eventId: string, h: HoldSpec): Promise<void>;
  deleteHold(calendarId: string, eventId: string): Promise<void>;
  /** Free dates of someone else's booking that was given up (slot-requests.ts). */
  applyOp(calendarId: string, op: CalendarOp): Promise<void>;
}

const subject = () => process.env.PORTAL_CALENDAR_SUBJECT || process.env.PORTAL_MAIL_FROM || "";

// ---- Times --------------------------------------------------------------

/** Raleigh's UTC offset on a date, "-05:00" or "-04:00". */
function offset(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const m = part.match(/GMT([+-])(\d+)(?::(\d+))?/);
  return m ? `${m[1]}${m[2].padStart(2, "0")}:${(m[3] ?? "00").padStart(2, "0")}` : "-05:00";
}
const rfc = (date: string, hhmm: string) => `${date}T${hhmm}:00${offset(date)}`;

/** A Google dateTime in Raleigh time, as date and "HH:MM". */
function local(dateTime: string): { date: string; time: string } {
  const d = new Date(dateTime);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// ---- Google Calendar ---------------------------------------------------

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  transparency?: string;
  recurringEventId?: string;
  recurrence?: string[];
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  originalStartTime?: { dateTime?: string; date?: string };
  organizer?: { email?: string; self?: boolean };
  creator?: { email?: string };
  extendedProperties?: { private?: Record<string, string> };
};

async function call<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const token = await delegatedToken(subject(), SCOPE);
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204 || res.status === 410) return undefined as T;
  if (!res.ok) throw failed("calendar", `Calendar ${init.method ?? "GET"} ${path.split("?")[0]} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function listAll(calendarId: string, path: string, query: Record<string, string>): Promise<GEvent[]> {
  const out: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const q = { ...query, maxResults: "2500", ...(pageToken ? { pageToken } : {}) };
    const body = await call<{ items?: GEvent[]; nextPageToken?: string }>(`calendars/${encodeURIComponent(calendarId)}/${path}`, { query: q });
    out.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out;
}

/** One calendar entry as busy time, split by date (an all-day or multi-day entry blocks each whole day). */
function toBusy(roomId: string, g: GEvent): BusyItem[] {
  if (g.status === "cancelled" || g.transparency === "transparent") return [];
  const cardId = g.extendedProperties?.private?.portalCard;
  const label = (g.summary ?? "Busy").replace(/^Hold \(pending approval\): /, "");
  const kind: BusyItem["kind"] = cardId ? (g.status === "tentative" ? "pending" : "booking") : isStandingTitle(label) ? "standing" : "booking";
  const common = { roomId, label, kind, eventId: g.recurringEventId ?? g.id, ...(cardId ? { cardId } : {}), organizerEmail: g.organizer?.self ? g.creator?.email : g.organizer?.email ?? g.creator?.email };
  if (g.start?.dateTime && g.end?.dateTime) {
    const s = local(g.start.dateTime), e = local(g.end.dateTime);
    if (s.date === e.date) return [{ ...common, date: s.date, start: s.time, end: e.time }];
    const out: BusyItem[] = [{ ...common, date: s.date, start: s.time, end: "23:59" }];
    for (let d = addDays(s.date, 1); d < e.date; d = addDays(d, 1)) out.push({ ...common, date: d, start: "00:00", end: "23:59" });
    if (e.time !== "00:00") out.push({ ...common, date: e.date, start: "00:00", end: e.time });
    return out;
  }
  if (g.start?.date) {
    const out: BusyItem[] = [];
    for (let d = g.start.date; d < (g.end?.date ?? addDays(g.start.date, 1)); d = addDays(d, 1)) out.push({ ...common, date: d, start: "00:00", end: "23:59" });
    return out;
  }
  return [];
}

function holdBody(h: HoldSpec) {
  const exdates = h.except.map((d) => `EXDATE;TZID=${TIME_ZONE}:${d.replace(/-/g, "")}T${h.start.replace(":", "")}00`);
  return {
    summary: h.status === "tentative" ? `Hold (pending approval): ${h.summary}` : h.summary,
    description: h.description,
    status: h.status,
    transparency: "opaque",
    start: { dateTime: `${h.date}T${h.start}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${h.date}T${h.end}:00`, timeZone: TIME_ZONE },
    recurrence: h.recur ? [rrule(h.date, h.recur), ...exdates] : undefined,
    extendedProperties: { private: { portalCard: h.cardId } },
  };
}

const googleCalendar: RoomCalendar = {
  async listBusy(cals, from, to) {
    const lists = await Promise.all(
      cals.map(async (c) => {
        const items = await listAll(c.calendarId, "events", { timeMin: rfc(from, "00:00"), timeMax: rfc(addDays(to, 1), "00:00"), singleEvents: "true", timeZone: TIME_ZONE, showDeleted: "false" });
        return items.flatMap((g) => toBusy(c.roomId, g));
      }),
    );
    return lists.flat().filter((b) => b.date >= from && b.date <= to);
  },
  async seriesDates(calendarId, eventId, from, to) {
    const items = await listAll(calendarId, `events/${encodeURIComponent(eventId)}/instances`, { timeMin: rfc(from, "00:00"), timeMax: rfc(addDays(to, 1), "00:00"), timeZone: TIME_ZONE });
    const dates = items.filter((g) => g.status !== "cancelled").map((g) => (g.start?.dateTime ? local(g.start.dateTime).date : g.start?.date ?? ""));
    if (!dates.length) {
      const one = await call<GEvent>(`calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
      const d = one?.start?.dateTime ? local(one.start.dateTime).date : one?.start?.date;
      return d ? [d] : [];
    }
    return [...new Set(dates.filter(Boolean))].sort();
  },
  async createHold(calendarId, h) {
    const g = await call<GEvent>(`calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: holdBody(h) });
    return g.id;
  },
  async updateHold(calendarId, eventId, h) {
    await call(`calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "PATCH", body: holdBody(h) });
  },
  async deleteHold(calendarId, eventId) {
    await call(`calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  },
  async applyOp(calendarId, op) {
    const ev = `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(op.eventId)}`;
    if (op.op === "delete") return void (await call(ev, { method: "DELETE" }));
    if (op.op === "end_series") {
      const g = await call<GEvent>(ev);
      const until = op.lastDate.replace(/-/g, "") + "T235959Z";
      const recurrence = (g.recurrence ?? []).map((r) => (r.startsWith("RRULE:") ? r.replace(/;(UNTIL|COUNT)=[^;]*/g, "") + `;UNTIL=${until}` : r));
      return void (await call(ev, { method: "PATCH", body: { recurrence } }));
    }
    // One date of a series: cancel that occurrence only.
    const items = await listAll(calendarId, `events/${encodeURIComponent(op.eventId)}/instances`, { timeMin: rfc(op.date, "00:00"), timeMax: rfc(addDays(op.date, 1), "00:00"), timeZone: TIME_ZONE });
    for (const g of items) await call(`calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(g.id)}`, { method: "PATCH", body: { status: "cancelled" } });
  },
};

// ---- Development: a sample calendar in memory ---------------------------

type DevEvent = { id: string; calendarId: string; summary: string; dates: string[]; start: string; end: string; status: HoldStatus; cardId?: string; organizerEmail?: string };
const g = globalThis as unknown as { __iarCal?: { events: DevEvent[]; seq: number; seeded: boolean } };
const mem = (g.__iarCal ??= { events: [], seq: 0, seeded: false });

/** Seeds the sample calendar once: standing holds from the room policy and a few bookings. */
export function seedDevCalendar(rooms: { id: string; calendarId: string; name: string }[], today: string) {
  if (mem.seeded) return;
  mem.seeded = true;
  const cal = (match: RegExp) => rooms.filter((r) => match.test(r.name)).map((r) => r.calendarId);
  const days = Array.from({ length: 150 }, (_, i) => addDays(today, i - 14));
  const add = (calendarIds: string[], summary: string, dates: string[], start: string, end: string, organizerEmail = "office@dev.local") => {
    for (const calendarId of calendarIds) mem.events.push({ id: `dev${++mem.seq}`, calendarId, summary, dates, start, end, status: "confirmed", organizerEmail });
  };
  const prayer = cal(/Prayer Hall/);
  const school = cal(/MPH|Room 220|Room 230|3rd floor|Red Brick/);
  const weekdays = days.filter((d) => dayOfWeek(d) >= 1 && dayOfWeek(d) <= 5);
  add(school, "Al-Iman & An-Noor school hours", weekdays, "08:00", "15:30");
  add(school, "Al-Furqan weekend school (until Zuhr)", days.filter((d) => dayOfWeek(d) === 0), "09:00", "13:30");
  add([...prayer, ...cal(/A&B/)], "Jumuah", days.filter((d) => dayOfWeek(d) === 5), "12:30", "14:30");
  for (const [name, s, e] of [["Zuhr prayer", "13:15", "13:45"], ["Asr prayer", "16:45", "17:10"], ["Maghrib prayer", "18:35", "19:00"], ["Isha prayer", "19:55", "20:20"]] as const)
    add(prayer, name, name === "Zuhr prayer" ? days.filter((d) => dayOfWeek(d) !== 5) : days, s, e);
  add(cal(/Red Brick/), "Food pantry", days.filter((d) => dayOfWeek(d) === 6 && weekOfMonth(d) === 1), "08:00", "12:00");
  const next = (dow: number, after: number) => days.find((d) => d >= addDays(today, after) && dayOfWeek(d) === dow)!;
  add(cal(/A&B/), "Youth Basketball League", [next(6, 8)], "10:00", "13:00", "sports@dev.local");
  add(cal(/MPH B/), "Sisters' fitness", eventDates(next(0, 3), { freq: "weekly", until: addDays(next(0, 3), 56) }), "16:00", "18:00", "women@dev.local");
  add(cal(/Room 280/), "Shura meeting", [next(4, 11)], "19:00", "21:00", "shura@dev.local");
  add(cal(/Room 250/), "Adult Quran class", eventDates(next(2, 1), { freq: "weekly", until: addDays(next(2, 1), 70) }), "19:30", "21:00", "education@dev.local");
}

const devCalendar: RoomCalendar = {
  async listBusy(cals, from, to) {
    const out: BusyItem[] = [];
    for (const c of cals)
      for (const e of mem.events.filter((x) => x.calendarId === c.calendarId))
        for (const date of e.dates.filter((d) => d >= from && d <= to))
          out.push({ roomId: c.roomId, date, start: e.start, end: e.end, label: e.summary, kind: e.cardId ? (e.status === "tentative" ? "pending" : "booking") : isStandingTitle(e.summary) ? "standing" : "booking", eventId: e.id, ...(e.cardId ? { cardId: e.cardId } : {}), organizerEmail: e.organizerEmail });
    return out;
  },
  async seriesDates(calendarId, eventId, from, to) {
    return (mem.events.find((e) => e.id === eventId)?.dates ?? []).filter((d) => d >= from && d <= to);
  },
  async createHold(calendarId, h) {
    const id = `dev${++mem.seq}`;
    mem.events.push({ id, calendarId, summary: h.summary, dates: eventDates(h.date, h.recur).filter((d) => !h.except.includes(d)), start: h.start, end: h.end, status: h.status, cardId: h.cardId, organizerEmail: "portal@dev.local" });
    return id;
  },
  async updateHold(calendarId, eventId, h) {
    const e = mem.events.find((x) => x.id === eventId);
    if (e) Object.assign(e, { summary: h.summary, dates: eventDates(h.date, h.recur).filter((d) => !h.except.includes(d)), start: h.start, end: h.end, status: h.status });
  },
  async deleteHold(calendarId, eventId) {
    mem.events = mem.events.filter((x) => x.id !== eventId);
  },
  async applyOp(calendarId, op) {
    const e = mem.events.find((x) => x.id === op.eventId);
    if (!e) return;
    if (op.op === "delete") mem.events = mem.events.filter((x) => x !== e);
    else if (op.op === "end_series") e.dates = e.dates.filter((d) => d <= op.lastDate);
    else e.dates = e.dates.filter((d) => d !== op.date);
  },
};

export function roomCalendar(): RoomCalendar {
  return isDevAuth() ? devCalendar : googleCalendar;
}

/** The hold's window: the event plus setup and cleanup. */
export function holdWindow(e: { start: string; end: string; setup: number; teardown: number }): { start: string; end: string } {
  return { start: fromMinutes(toMinutes(e.start) - e.setup), end: fromMinutes(toMinutes(e.end) + e.teardown) };
}
