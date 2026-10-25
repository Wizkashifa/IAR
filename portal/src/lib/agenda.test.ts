/**
 * The agenda and "Find a room": what's booked where, and which rooms fit.
 * Rooms and bookings mirror the dev sample calendar (rooms-google.ts,
 * seedDevCalendar in calendar.ts). Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { type AgendaCard, agendaFrom, freeRoomsFrom, rangeText } from "./agenda-core";
import { type GoogleRoom, mergeRooms } from "./events/rooms";
import type { BusyItem } from "./events/rules";
import { todayInRaleigh } from "./events/series";

const dev = (id: string, name: string, capacity: number, building = "Main campus"): GoogleRoom => ({ id, name, building, capacity, calendarId: `${id}@resource.dev.local` });
const rooms = mergeRooms(
  [
    dev("mphA", "MPH A – half gym", 75),
    dev("mphB", "MPH B – half gym", 75),
    dev("mphAB", "MPH A&B – full gym", 150),
    dev("cafe", "Al-Maidah Cafe", 50),
    dev("r240", "Room 240 – conference room", 30),
    dev("r250", "Room 250 – An Noor meeting room", 20),
    dev("flex", "Community Flex Room", 40),
    dev("page", "Page Road hall", 120, "Page Road"),
    dev("store", "Storage room", 10),
  ],
  {
    mphA: { bookable: true, food: true, mph: true },
    mphB: { bookable: true, food: true, mph: true },
    mphAB: { bookable: true, food: true, mph: true, overlaps: ["mphA", "mphB"] },
    cafe: { bookable: true, food: true, note: "$100/hour minimum food and drink purchase." },
    r240: { bookable: true, food: true, restricted: true },
    r250: { bookable: true },
    flex: { bookable: true },
    page: { bookable: true, food: true },
  },
);

const SAT = "2026-11-07";
const SUN = "2026-11-08";
const busy: BusyItem[] = [
  // Standing hold under the room policy, on the gym and both halves' calendars.
  { roomId: "mphAB", date: SUN, start: "09:00", end: "13:30", label: "Al-Furqan weekend school (until Zuhr)", kind: "standing", eventId: "s1" },
  { roomId: "mphA", date: SUN, start: "09:00", end: "13:30", label: "Al-Furqan weekend school (until Zuhr)", kind: "standing", eventId: "s2" },
  { roomId: "mphB", date: SUN, start: "09:00", end: "13:30", label: "Al-Furqan weekend school (until Zuhr)", kind: "standing", eventId: "s3" },
  // A booking someone made on the calendar.
  { roomId: "mphAB", date: SAT, start: "10:00", end: "13:00", label: "Youth Basketball League", kind: "booking", eventId: "b1" },
  // A portal request: the hold includes setup and cleanup.
  { roomId: "r250", date: SAT, start: "17:30", end: "21:30", label: "Youth Family Night · Youth", kind: "booking", eventId: "h1", cardId: "EV-1031" },
  { roomId: "flex", date: SAT, start: "18:00", end: "20:00", label: "Sisters' Tafsir Circle · Women", kind: "pending", eventId: "h2", cardId: "EV-1050" },
];
const cards: AgendaCard[] = [
  { id: "EV-1031", status: "approved", event: { title: "Youth Family Night", committeeName: "Youth", start: "18:00", end: "21:00" } },
];
const ctx = { rules: {}, mayBookRestricted: false };

test("rangeText: short times, one AM/PM when both share it", () => {
  assert.equal(rangeText("18:00", "20:00"), "6–8 PM");
  assert.equal(rangeText("11:30", "13:00"), "11:30 AM–1 PM");
  assert.equal(rangeText("09:00", "13:30"), "9 AM–1:30 PM");
  assert.equal(rangeText("00:00", "00:30"), "12–12:30 AM");
});

test("agenda: one entry per event per date, rooms merged, sorted by date and time", () => {
  const a = agendaFrom(busy, rooms, cards);
  assert.deepEqual(a.map((x) => `${x.date} ${x.start} ${x.title}`), [
    `${SAT} 10:00 Youth Basketball League`,
    `${SAT} 18:00 Sisters' Tafsir Circle · Women`,
    `${SAT} 18:00 Youth Family Night`,
    `${SUN} 09:00 Al-Furqan weekend school (until Zuhr)`,
  ]);
  const school = a.find((x) => x.source === "standing")!;
  assert.deepEqual(school.roomIds, ["mphAB", "mphA", "mphB"]);
  assert.equal(school.rooms.length, 3);
});

test("agenda: portal requests show the event's own times and title; the hold keeps setup and cleanup", () => {
  const fam = agendaFrom(busy, rooms, cards).find((x) => x.cardId === "EV-1031")!;
  assert.equal(fam.source, "portal");
  assert.equal(fam.title, "Youth Family Night");
  assert.equal(fam.committee, "Youth");
  assert.deepEqual([fam.start, fam.end, fam.holdStart, fam.holdEnd], ["18:00", "21:00", "17:30", "21:30"]);
  assert.equal(fam.pending, false);
  // A request the agenda wasn't given still shows, from the calendar entry.
  const tafsir = agendaFrom(busy, rooms, cards).find((x) => x.cardId === "EV-1050")!;
  assert.equal(tafsir.pending, true);
  assert.equal(tafsir.title, "Sisters' Tafsir Circle · Women");
});

test("agenda: standing holds can be left out", () => {
  assert.equal(agendaFrom(busy, rooms, cards, { standing: false }).some((x) => x.source === "standing"), false);
});

test("find a room: free rooms first, snuggest fit first, with reasons for the rest", () => {
  const out = freeRoomsFrom({ date: SAT, start: "18:00", end: "20:00", attendance: 18 }, rooms, busy, ctx);
  const free = out.filter((o) => o.ok).map((o) => o.room.id);
  // Room 250 and the flex room are taken; Room 240 is restricted; the storage room isn't bookable.
  // Snuggest first; the cafe has a note, so it comes after rooms with nothing to note.
  assert.deepEqual(free, ["mphA", "mphB", "page", "mphAB", "cafe"]);
  assert.equal(out.some((o) => o.room.id === "store"), false);
  assert.deepEqual(out.find((o) => o.room.id === "cafe")!.notes, ["$100/hour minimum food and drink purchase."]);
  const r250 = out.find((o) => o.room.id === "r250")!;
  assert.deepEqual(r250.reasons, ["Booked 5:30–9:30 PM: Youth Family Night · Youth"]);
  const flex = out.find((o) => o.room.id === "flex")!;
  assert.deepEqual(flex.reasons, ["Requested 6–8 PM: Sisters' Tafsir Circle · Women"]);
  assert.deepEqual(out.find((o) => o.room.id === "r240")!.reasons, ["Leadership, imams and chairs only"]);
});

test("find a room: capacity, food and the people who may book restricted rooms", () => {
  const out = freeRoomsFrom({ date: SAT, start: "18:00", end: "20:00", attendance: 80, food: true }, rooms, busy, { rules: {}, mayBookRestricted: true });
  const by = (id: string) => out.find((o) => o.room.id === id)!;
  assert.deepEqual(by("mphA").reasons, ["Too small for 80 (holds 75)"]);
  assert.deepEqual(by("r250").reasons, ["Booked 5:30–9:30 PM: Youth Family Night · Youth", "Too small for 80 (holds 20)", "No food allowed"]);
  assert.deepEqual(by("r240").reasons, ["Too small for 80 (holds 30)"]);
  assert.deepEqual(out.filter((o) => o.ok).map((o) => o.room.id), ["page", "mphAB"]);
  // Turning rules off in Portal Settings turns them off here too.
  const off = freeRoomsFrom({ date: SAT, start: "18:00", end: "20:00", attendance: 80, food: true }, rooms, busy, { rules: { capacity: false, food: false }, mayBookRestricted: false });
  assert.deepEqual(off.find((o) => o.room.id === "mphA")!.reasons, []);
});

test("find a room: setup and cleanup count, and the gym covers both halves", () => {
  // 1:30–3 PM on Sunday: free, but the 30-minute setup runs into weekend school.
  const sun = freeRoomsFrom({ date: SUN, start: "13:45", end: "15:00", attendance: 40 }, rooms, busy, ctx);
  assert.deepEqual(sun.find((o) => o.room.id === "mphA")!.reasons, ["Held 9 AM–1:30 PM: Al-Furqan weekend school (until Zuhr)"]);
  const noSetup = freeRoomsFrom({ date: SUN, start: "13:45", end: "15:00", setup: 0, attendance: 40 }, rooms, busy, ctx);
  assert.equal(noSetup.find((o) => o.room.id === "mphA")!.ok, true);
  // The basketball booking is on the full gym's calendar, so each half is taken too.
  const sat = freeRoomsFrom({ date: SAT, start: "11:00", end: "12:00", attendance: 30 }, rooms, busy, ctx);
  assert.match(sat.find((o) => o.room.id === "mphB")!.reasons[0], /^Booked 10 AM–1 PM: Youth Basketball League/);
});

test("find a room: the MPH cleaning gap is a note, not a block", () => {
  const out = freeRoomsFrom({ date: SAT, start: "14:00", end: "15:00", setup: 0, cleanup: 0, attendance: 100 }, rooms, busy, ctx);
  const gym = out.find((o) => o.room.id === "mphAB")!;
  assert.equal(gym.ok, true);
  assert.equal(gym.notes.length, 1);
  assert.match(gym.notes[0], /^Less than 2 hours between this and Youth Basketball League/);
  // Rooms with nothing to note come first.
  assert.equal(out[0].room.id, "page");
});

test("find a room: one campus, a series, and a time that ends before it starts", () => {
  const page = freeRoomsFrom({ date: SAT, start: "18:00", end: "20:00", attendance: 10, campus: "Page Road" }, rooms, busy, ctx);
  assert.deepEqual(page.map((o) => o.room.id), ["page"]);
  const series = freeRoomsFrom({ date: "2026-10-31", start: "18:00", end: "20:00", attendance: 10, recur: { freq: "weekly", until: "2026-11-14" } }, rooms, busy, ctx);
  assert.deepEqual(series.find((o) => o.room.id === "r250")!.reasons, ["Booked 5:30–9:30 PM: Youth Family Night · Youth (1 of 3 dates)"]);
  assert.deepEqual(freeRoomsFrom({ date: SAT, start: "20:00", end: "18:00", attendance: 10 }, rooms, busy, ctx), []);
});

test("today is Raleigh's date, not the server's: 11 PM in Raleigh is already tomorrow in UTC", () => {
  // Oct 25, 2026 03:03 UTC is Oct 24, 11:03 PM in Raleigh (daylight time until Nov 1).
  assert.equal(todayInRaleigh(new Date("2026-10-25T03:03:00Z")), "2026-10-24");
  assert.equal(todayInRaleigh(new Date("2026-10-25T04:00:00Z")), "2026-10-25");
  // After the clocks change, midnight in Raleigh is 05:00 UTC.
  assert.equal(todayInRaleigh(new Date("2026-11-02T04:30:00Z")), "2026-11-01");
  assert.equal(todayInRaleigh(new Date("2026-11-02T05:00:00Z")), "2026-11-02");
});
