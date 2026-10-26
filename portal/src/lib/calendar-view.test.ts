/**
 * The Calendar page's plain functions: week and month days, filters, and
 * "Find a room" through to the filled-in event form. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgendaItem } from "./agenda-core";
import { byDay, committeesIn, filterAgenda, monthWeeks, readNeed, readPrefill, requestHref, stepView, viewRange, viewTitle, weekDays, weekStart } from "./calendar-view";
import { type GoogleRoom, mergeRooms } from "./events/rooms";

const dev = (id: string, name: string, capacity: number): GoogleRoom => ({ id, name, building: "Main campus", capacity, calendarId: `${id}@resource.dev.local` });
const rooms = mergeRooms([dev("mphA", "MPH A", 75), dev("mphB", "MPH B", 75), dev("mphAB", "MPH A&B", 150), dev("r250", "Room 250", 20)], {
  mphA: { bookable: true },
  mphB: { bookable: true },
  mphAB: { bookable: true, overlaps: ["mphA", "mphB"] },
  r250: { bookable: true },
});

const item = (o: Partial<AgendaItem> & Pick<AgendaItem, "date" | "title">): AgendaItem => ({ key: `${o.date}|${o.title}`, start: "18:00", end: "20:00", source: "portal", pending: false, roomIds: ["r250"], rooms: ["Room 250"], ...o });

test("weeks run Sunday to Saturday", () => {
  assert.equal(weekStart("2026-10-25"), "2026-10-25"); // a Sunday
  assert.equal(weekStart("2026-10-31"), "2026-10-25");
  assert.deepEqual(weekDays("2026-10-28"), ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
  assert.equal(stepView("week", "2026-10-28", 1), "2026-11-01");
  assert.equal(stepView("week", "2026-10-28", -1), "2026-10-18");
});

test("a month is whole weeks, with the days either side marked", () => {
  const weeks = monthWeeks("2026-11-14");
  assert.equal(weeks[0][0].date, "2026-11-01"); // Nov 1, 2026 is a Sunday
  assert.equal(weeks.length, 5);
  assert.equal(weeks[4][6].date, "2026-12-05");
  assert.equal(weeks[4][6].inMonth, false);
  const oct = monthWeeks("2026-10-01");
  assert.equal(oct[0][0].date, "2026-09-27");
  assert.equal(oct[0][0].inMonth, false);
  assert.deepEqual(viewRange("month", "2026-10-15"), { from: "2026-09-27", to: "2026-10-31" });
  assert.deepEqual(viewRange("week", "2026-10-15"), { from: "2026-10-11", to: "2026-10-17" });
  assert.equal(stepView("month", "2026-10-15", 1), "2026-11-01");
  assert.equal(stepView("month", "2026-01-31", -1), "2025-12-01");
});

test("filters: a room keeps what shares its space; a committee keeps its requests", () => {
  const items = [
    item({ date: "2026-10-26", title: "Full gym", roomIds: ["mphAB"], committee: "Youth" }),
    item({ date: "2026-10-26", title: "Halaqa", committee: "Youth" }),
    item({ date: "2026-10-27", title: "Sisters' fitness", roomIds: ["mphB"], committee: "Women's Committee" }),
    item({ date: "2026-10-27", title: "Isha", roomIds: ["mphA"], source: "calendar" }),
  ];
  assert.deepEqual(filterAgenda(items, rooms, { roomId: "mphA" }).map((a) => a.title), ["Full gym", "Isha"]);
  assert.deepEqual(filterAgenda(items, rooms, { roomId: "mphAB" }).map((a) => a.title), ["Full gym", "Sisters' fitness", "Isha"]);
  assert.deepEqual(filterAgenda(items, rooms, { committee: "Youth" }).map((a) => a.title), ["Full gym", "Halaqa"]);
  assert.deepEqual(committeesIn(items), ["Women's Committee", "Youth"]);
  assert.deepEqual([...byDay(filterAgenda(items, rooms, {})).keys()], ["2026-10-26", "2026-10-27"]);
});

test("Find a room: nothing asked until a date is given, then plain errors", () => {
  assert.deepEqual(readNeed({}, "2026-10-25"), { errors: [] });
  assert.deepEqual(readNeed({ date: "2026-10-24", start: "18:00", end: "20:00", people: "40" }, "2026-10-25").errors, ["Pick today or a later date."]);
  assert.deepEqual(readNeed({ date: "2026-11-07", start: "20:00", end: "18:00", people: "0" }, "2026-10-25").errors, ["The end time has to be after the start time.", "Say about how many people will come."]);
  assert.deepEqual(readNeed({ date: "2026-11-07", start: "18:00", end: "20:00", people: "60", food: "1" }, "2026-10-25"), {
    need: { date: "2026-11-07", start: "18:00", end: "20:00", attendance: 60, food: true },
    errors: [],
  });
});

test("'Request this room' fills in the event form, and only with what it can read", () => {
  const href = requestHref({ date: "2026-11-07", start: "18:00", end: "20:00", attendance: 60, food: true }, "mphAB");
  assert.equal(href, "/events/new?date=2026-11-07&start=18%3A00&end=20%3A00&room=mphAB&people=60&food=1");
  const q = Object.fromEntries(new URL(href, "https://portal.example").searchParams);
  assert.deepEqual(readPrefill(q, ["mphAB", "r250"], "2026-10-25"), { date: "2026-11-07", start: "18:00", end: "20:00", rooms: ["mphAB"], attendance: 60, food: true });
  // A room that isn't bookable, a past date or times the wrong way round are left out.
  assert.deepEqual(readPrefill({ date: "2026-10-01", start: "20:00", end: "18:00", room: "store", people: "abc" }, ["mphAB"], "2026-10-25"), {});
});

test("view titles", () => {
  assert.equal(viewTitle("week", "2026-10-28"), "Oct 25 – 31, 2026");
  assert.equal(viewTitle("week", "2026-11-03"), "Nov 1 – 7, 2026");
  assert.equal(viewTitle("week", "2026-12-30"), "Dec 27, 2026 – Jan 2, 2027");
  assert.equal(viewTitle("week", "2026-11-30"), "Nov 29 – Dec 5, 2026");
  assert.equal(viewTitle("month", "2026-11-14"), "November 2026");
});
