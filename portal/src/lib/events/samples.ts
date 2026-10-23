import "server-only";
import { roomCalendar } from "../calendar";
import type { Card } from "../cards";
import { ORG } from "../org";
import { DEV_ROOMS, DEV_ROOM_SETTINGS } from "../rooms-google";
import { teamGroupEmail } from "../teams";
import type { EventContext } from "./context";
import { syncHolds } from "./holds";
import { mergeRooms } from "./rooms";
import { addDays, dayOfWeek, todayInRaleigh } from "./series";
import type { EventInput } from "./types";
import * as wf from "./workflow";

/**
 * Sample event requests for local development, built by running the real
 * workflow (and putting their holds on the sample calendar), so every stage
 * and history line is what the app would produce. Made-up events.
 */
const chair: wf.EventActor = { email: "chair@dev.local", name: "Sample Chair", roles: ["member", "chairs"] };
const volunteer: wf.EventActor = { email: "volunteer@dev.local", name: "Sample Volunteer", roles: ["member"] };
const director: wf.EventActor = { email: "director@dev.local", name: "Sample Director", roles: ["member"] };
const exec: wf.EventActor = { email: "exec@dev.local", name: "Sample Executive", roles: ["member", "executive"] };
const DIRECTORS = [director.email];

export async function sampleEvents(): Promise<Card[]> {
  const today = todayInRaleigh();
  const next = (dow: number, after: number) => {
    let d = addDays(today, after);
    while (dayOfWeek(d) !== dow) d = addDays(d, 1);
    return d;
  };
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5).toISOString();
  const youth = { committeeGroup: teamGroupEmail("Youth", ORG.domain), committeeName: "Youth" };
  const education = { committeeGroup: teamGroupEmail("Education", ORG.domain), committeeName: "Education" };
  const input = (over: Partial<EventInput>): EventInput => ({
    title: "",
    description: "",
    ...youth,
    date: next(6, 20),
    start: "18:00",
    end: "20:00",
    setup: 30,
    teardown: 30,
    rooms: [],
    attendance: 20,
    budget: 0,
    food: false,
    isPublic: false,
    registration: false,
    av: false,
    setupNotes: "",
    newProgram: false,
    outsideSpeaker: false,
    fundraiser: false,
    teamNotes: "",
    ...over,
  });
  const make = (id: string, i: EventInput, owner: wf.EventActor, daysAgo: number) => ({ ...wf.newEvent(i, owner, at(daysAgo), []), id });

  const gameNight = wf.submit(
    make("EV-1101", input({
      title: "Youth Game Night",
      description: "Board games, a trivia round with prizes and dinner together for youth and their parents. Youth volunteers set up the tables and clean up afterwards. Open to all families; no registration needed.",
      date: next(6, 22), rooms: ["dev-mphAB"], attendance: 60, budget: 400, food: true, isPublic: true, av: true,
      brief: { subtitle: "Games and Dinner for Families", text: "Youth and parents are invited to Youth Game Night: board games, a trivia round with prizes, and dinner together. Free and open to all families.", flyer: "Dinner included", regLink: "", payment: "", startOn: addDays(today, 5), files: "", final: true },
      avNeeds: { kinds: ["projector", "sound"], includes: ["laptop"], ack: true },
    }), chair, 1),
    chair, DIRECTORS, at(1),
  );

  const halaqa0 = wf.submit(
    make("EV-1102", input({
      title: "Youth Weekly Halaqa",
      description: "A weekly halaqa for high-school boys: Quran reflection, a short talk and Q&A with a youth mentor. The same small group each week.",
      date: next(3, 2), start: "19:00", end: "20:30", setup: 15, teardown: 15, recur: { freq: "weekly", until: addDays(next(3, 2), 70) }, rooms: ["dev-r280"], attendance: 15,
    }), volunteer, 30),
    volunteer, DIRECTORS, at(30),
  );
  const halaqa = wf.approve(wf.approve(halaqa0, director, DIRECTORS, at(28)), exec, DIRECTORS, at(27));

  const arabic = wf.submit(
    make("EV-1103", input({
      ...education,
      title: "Arabic for beginners",
      description: "An eight-week introduction to reading Arabic for adults, taught by a volunteer teacher. Free; registration helps us plan materials.",
      date: next(4, 16), start: "18:30", end: "20:00", recur: { freq: "weekly", until: addDays(next(4, 16), 49) }, rooms: ["dev-f3arabic"], attendance: 18, newProgram: true, registration: false,
    }), volunteer, 2),
    volunteer, [], at(2),
  );

  const family0 = wf.submit(
    make("EV-1104", input({
      title: "Family Night",
      description: "Dinner and a short talk for families.",
      date: next(2, 12), start: "17:00", end: "19:00", rooms: ["dev-r220"], attendance: 25, food: true,
    }), volunteer, 5),
    volunteer, DIRECTORS, at(5),
  );
  const family = wf.returnForChanges(family0, director, DIRECTORS, at(3), "Room 220 is in use for school until 3:30 and doesn't allow food. Try the MPH or the cafe.");

  const ctx = { rooms: mergeRooms(DEV_ROOMS, DEV_ROOM_SETTINGS), calendar: roomCalendar() } as EventContext;
  const out: Card[] = [];
  for (const c of [gameNight, halaqa, arabic, family]) out.push((await syncHolds(c, ctx)).card);
  return out;
}
