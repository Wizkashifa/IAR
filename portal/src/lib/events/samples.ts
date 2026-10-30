import "server-only";
import { roomCalendar, seedDevCalendar } from "../calendar";
import { directory } from "../groups";
import * as sr from "./slot-requests";
import { slotRequestStore } from "./slot-requests-store";
import type { Card } from "../cards";
import { ORG } from "../org";
import { DEV_ROOMS, DEV_ROOM_SETTINGS } from "../rooms-google";
import { teamGroupEmail } from "../teams";
import { parsePurchaseInput } from "../purchases/input";
import { purchaseContext } from "../purchases/settings";
import * as pw from "../purchases/workflow";
import { startCloseOut } from "./closeout";
import type { EventContext } from "./context";
import { syncHolds } from "./holds";
import { mergeRooms, roomById } from "./rooms";
import { dayOfWeek } from "./series";
import type { EventInput } from "./types";
import * as wf from "./workflow";
import { addDays, todayLocal } from "../dates";
import { autoPiece, newPiece } from "../marketing/linked";
import * as mw from "../marketing/workflow";
import { avTicket } from "../tickets/event-av";
import * as tw from "../tickets/workflow";

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
  const today = todayLocal();
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
      brief: { subtitle: "Games and Dinner for Families", text: "Youth and parents are invited to Youth Game Night: board games, a trivia round with prizes, and dinner together. Free and open to all families.", flyer: "Dinner included", regLink: "", payment: "", final: true },
      avNeeds: { kinds: ["projector", "sound"], includes: ["laptop"], ack: true },
    }), chair, 1),
    chair, DIRECTORS, at(1),
  );

  const halaqa0 = wf.submit(
    make("EV-1102", input({
      title: "Youth Weekly Halaqa",
      description: "A weekly halaqa for high-school boys: Quran reflection, a short talk and Q&A with a youth mentor. The same small group each week.",
      date: next(3, 2), start: "19:00", end: "20:30", setup: 15, teardown: 15, recur: { freq: "weekly", until: addDays(next(3, 2), 21) }, rooms: ["dev-r280"], attendance: 15, av: true, avNeeds: { kinds: ["sound"], includes: ["mics"], ack: true },
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

  // Approved without a director (the committee has none): straight to the executive.
  const approveNoDirector = (c: wf.EventCard, owner: wf.EventActor, daysAgo: number) => wf.approve(wf.submit(c, owner, [], at(daysAgo)), exec, [], at(daysAgo - 1));

  // Last week, now waiting on the requester to close it out, with a purchase linked to it.
  const movie0 = wf.submit(
    make("EV-1105", input({
      title: "Youth Movie Night",
      description: "A family-friendly film on the big screen for youth, with pizza and a short reflection afterwards. Youth volunteers set up the chairs and clean up.",
      date: addDays(today, -6), start: "18:30", end: "21:00", rooms: ["dev-mphA"], attendance: 45, budget: 300, food: true, av: true,
      avNeeds: { kinds: ["projector", "sound"], includes: ["video"], ack: true },
      setupNotes: "Rows of chairs facing the screen, two tables at the back for food.",
    }), chair, 30),
    chair, DIRECTORS, at(30),
  );
  let movie = wf.approve(wf.approve(movie0, director, DIRECTORS, at(28)), exec, DIRECTORS, at(27));
  movie = startCloseOut(movie, at(5));

  // Yesterday, still approved: the daily job moves it to close-out.
  const parents = approveNoDirector(
    make("EV-1106", input({
      ...education,
      title: "Weekend school parents' meeting",
      description: "The start-of-term meeting for weekend school parents: the year's schedule, volunteering and questions for the teachers.",
      date: addDays(today, -1), start: "18:00", end: "19:30", setup: 15, teardown: 15, rooms: ["dev-r250"], attendance: 18,
    }), volunteer, 20),
    volunteer, 20,
  );

  // Coming up: public, with A/V, a setup plan and running after hours. Its marketing pieces are below (samplePieces).
  const dinnerDate = next(6, 29);
  const dinner = approveNoDirector(
    make("EV-1107", input({
      committeeGroup: teamGroupEmail("Events Committee", ORG.domain), committeeName: "Events Committee",
      title: "Community Fall Dinner",
      description: "An evening dinner for the whole community: a short talk, dinner served at the tables and a children's corner. Tickets help us plan the food; volunteers serve and clean up.",
      date: dinnerDate, start: "18:30", end: "21:30", setup: 90, teardown: 60, rooms: ["dev-mphAB"], attendance: 160, budget: 2400, food: true, isPublic: true, registration: true, av: true,
      brief: { subtitle: "Dinner Together This Fall", text: "Join us for the Community Fall Dinner: a short talk, dinner and a children's corner. Tickets are $10 for adults and free for children.", flyer: "Tickets $10 · children free", regLink: "https://example.org/fall-dinner", payment: "$10 per adult, paid on the registration page", final: true },
      avNeeds: { kinds: ["sound", "projector"], includes: ["mics", "laptop"], ack: true },
      setupNotes: "20 round tables with 8 chairs each, a small stage at the front, two serving tables by the kitchen.",
    }), chair, 4),
    chair, 4,
  );

  // Tonight: on today's run sheet.
  const tonight = approveNoDirector(
    make("EV-1108", input({
      ...education,
      title: "Weekend school teachers' meeting",
      description: "Monthly meeting of the weekend school's volunteer teachers: the term plan, materials and new teachers to welcome.",
      date: today, start: "19:00", end: "20:30", setup: 15, teardown: 15, rooms: ["dev-flex"], attendance: 12, setupNotes: "Chairs in a circle.",
    }), chair, 10),
    chair, 10,
  );

  const ctx = { rooms: mergeRooms(DEV_ROOMS, DEV_ROOM_SETTINGS), calendar: roomCalendar() } as EventContext;
  const waiting = await waitingOnCalendarBooking(make, input, ctx, next(2, 15), at);
  const out: Card[] = [];
  for (const c of [gameNight, halaqa, arabic, family, movie, parents, dinner, tonight, ...(waiting ? [waiting] : [])]) out.push((await syncHolds(c, ctx)).card);
  out.push(await linkedPurchase("EV-1105", at));
  out.push(...samplePieces(dinner, gameNight, at));
  out.push(...sampleAvTickets({ movie, halaqa, dinner }, ctx, at));
  return out;
}

/**
 * A request whose setup runs 15 minutes into a meeting booked straight on
 * the calendar, waiting on its ask for the time: the office answers for that
 * booking, the ask closes if nobody does, and the requester is offered a
 * one-click fix (start later, or a shorter setup).
 */
async function waitingOnCalendarBooking(
  make: (id: string, i: EventInput, owner: wf.EventActor, daysAgo: number) => wf.EventCard,
  input: (over: Partial<EventInput>) => EventInput,
  ctx: EventContext,
  date: string,
  at: (daysAgo: number) => string,
): Promise<wf.EventCard | null> {
  seedDevCalendar(ctx.rooms, todayLocal());
  const room = roomById(ctx.rooms, "dev-flex");
  if (!room) return null;
  const busy = (await ctx.calendar.listBusy([{ roomId: room.id, calendarId: room.calendarId }], date, date)).find((b) => b.label === "Staff meeting");
  if (!busy?.eventId) return null;
  const card = make("EV-1109", input({
    ...{ committeeGroup: teamGroupEmail("Education", ORG.domain), committeeName: "Education" },
    title: "Tutoring afternoon",
    description: "Homework help for middle-school students with volunteer tutors: math, science and reading, in small groups. Parents can drop in to meet the tutors.",
    date, start: "13:30", end: "16:00", setup: 30, teardown: 15, rooms: [room.id], attendance: 25,
  }), volunteer, 2);
  const hold: sr.Hold = { kind: "booking", label: busy.label, room: room.name, start: busy.start, end: busy.end, calendarEventId: busy.eventId, calendarId: room.calendarId, organizerEmail: busy.organizerEmail, seriesDates: [date] };
  const slots = await slotRequestStore();
  const r = sr.newSlotRequest({ fromCard: card.id, requester: volunteer, hold, dates: [date], reason: "It's the only afternoon our tutors are all free." }, await directory(), await slots.listForHold(sr.holdKeyOf(hold)), at(2));
  if (!r.ok) return null;
  const ask = await slots.create(r.value);
  // Education has no director in the samples, so it goes to executive review once it has the time.
  return wf.submit(card, volunteer, [], at(2), { waitingOnAsk: ask.id });
}

/**
 * A/V tickets for the events that asked for A/V, made the way approval makes
 * them (one per date): the movie night's, done; the weekly halaqa's, the
 * first one taken by IT; the Fall Dinner's, new.
 */
function sampleAvTickets(events: { movie: wf.EventCard; halaqa: wf.EventCard; dinner: wf.EventCard }, ctx: EventContext, at: (daysAgo: number) => string): Card[] {
  const it: tw.TicketActor = { email: "it@dev.local", name: "Sample IT", roles: ["member", "it", "av"] };
  const team = { it: [it.email], facilities: [] };
  const roomName = (id: string) => roomById(ctx.rooms, id)?.name ?? id;
  let n = 1050;
  const tickets = (event: wf.EventCard, daysAgo: number) =>
    event.event.dates.map((d) => {
      const t = avTicket(event, d, roomName, at(daysAgo));
      t.id = `TK-${n++}`;
      return t;
    });
  const [movie] = tickets(events.movie, 27);
  const movieDone = tw.resolve(tw.assign(movie, it, at(8), it.email, team), it, at(6), "Projector and two speakers set up; returned to the A/V closet.");
  const [first, ...rest] = tickets(events.halaqa, 27);
  return [movieDone, tw.assign(first, it, at(2), it.email, team), ...rest, ...tickets(events.dinner, 3)];
}

/**
 * Marketing pieces linked to events, made the way the app makes them: the
 * Fall Dinner's "Flyer and announcement" (added on approval, now in
 * progress), social media posts (new) and a banner (scheduled); and a video
 * for Game Night, added while that event is still in review.
 */
function samplePieces(dinner: wf.EventCard, gameNight: wf.EventCard, at: (daysAgo: number) => string): Card[] {
  const marketing: mw.Actor = { email: "marketing@dev.local", name: "Sample Marketing", roles: ["member", "marketing"] };
  const today = todayLocal();
  let n = 1050;
  const piece = (event: wf.EventCard, by: mw.Actor, answers: Record<string, string>, daysAgo: number) => {
    const c = newPiece(event, { kind: "event", committee: event.event.committeeName, answers }, by, at(daysAgo));
    c.id = `MK-${n++}`;
    return c;
  };
  const auto = autoPiece(null, dinner, [], at(3));
  if (!auto) throw new Error("Bad sample: the Fall Dinner should get its flyer and announcement");
  auto.id = `MK-${n++}`;
  const flyer = mw.start(mw.schedule(auto, marketing, at(2), auto.marketing.answers.due), marketing, at(1));
  const posts = piece(dinner, chair, { piece: "social", desc: "Three posts: one when tickets open, one a week before, one on the day. Please include the children's corner.", due: addDays(today, 12) }, 1);
  const banner = mw.schedule(piece(dinner, marketing, { piece: "banner", desc: "A vinyl banner for the front entrance, 6 by 3 feet.", due: addDays(today, 15) }, 2), marketing, at(1), addDays(today, 15));
  const video = piece(gameNight, chair, { piece: "video", desc: "A 30-second reel from last year's game night photos, for Instagram and the lobby screens.", due: addDays(today, 10) }, 0);
  return [flyer, posts, banner, video];
}

/** A reimbursement for the movie night's food, linked to it, approved by the chair and waiting on finance. */
async function linkedPurchase(eventId: string, at: (daysAgo: number) => string): Promise<Card> {
  const s = (await purchaseContext()).routing;
  const vol: pw.Actor = { email: volunteer.email, name: volunteer.name, roles: ["member"] };
  const ch: pw.Actor = { email: chair.email, name: chair.name, roles: ["member", "chairs"] };
  const r = parsePurchaseInput(
    { kind: "reimburse", fund: "Youth Expenses", description: "Movie night pizza and drinks", delivery: "office_pickup", mailingAddress: "20 Sample Ln, Cary, NC 27511", lines: [{ accountId: "a39", amount: "186.40", note: "Pizza and drinks" }], attestationName: vol.name, eventCardId: eventId },
    { requesterName: vol.name, cards: [], vendors: [] },
  );
  if (!r.ok) throw new Error(`Bad sample: ${r.errors.join("; ")}`);
  const draft = pw.newPurchase(r.details, vol.email, at(5), [{ name: "receipt-pizza.jpg", size: 120_000 }]);
  // Numbered well after the purchase samples so the two never collide.
  draft.id = "PO-12090";
  return pw.approve(pw.submit(draft, vol, s, at(5)), ch, s, at(4));
}
