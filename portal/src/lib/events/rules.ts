/**
 * The automatic checks on an event request: the room calendar (the IAR
 * calendar is the source of truth) and the room policy. Most checks are
 * flags for the reviewers; a clash with a booking, a missing end date on a
 * series or missing marketing details stop the request. Admins can turn the
 * policy rules off in Portal Settings. Plain functions so they can be tested.
 */
import { type Room, roomById, roomsOverlap } from "./rooms";
import { SERIES_MAX_MONTHS, dayText, daysBetween, eventDates, fromMinutes, longDate, seriesMaxEnd, timeText, toMinutes } from "./series";
import type { Check, EventInput } from "./types";

/** Policy rules an admin can turn off. The calendar check can't be turned off. */
export const RULES = [
  { id: "gap", name: "MPH needs a 2-hour cleaning gap between events", policy: "Room policy §4" },
  { id: "capacity", name: "Attendance within the room's capacity", policy: "Room list" },
  { id: "food", name: "Food only in rooms that allow it", policy: "Room policy §8" },
  { id: "restricted", name: "Restricted rooms: leadership, imams and chairs only", policy: "Room policy §10" },
  { id: "lead", name: "Lead time: 1 week for review, 3 weeks for public events", policy: "Room policy §4 · Marketing form" },
  { id: "afterhours", name: "After-hours security (before 7 AM or after 10 PM)", policy: "Room policy §3" },
  { id: "advert", name: "No advertising until approved", policy: "Room policy §4" },
] as const;
export type RuleId = (typeof RULES)[number]["id"];

/** Rules are on unless an admin turned them off. */
export const ruleOn = (rules: Partial<Record<string, boolean>>, id: RuleId) => rules[id] !== false;

/** Words that mark a calendar entry as a standing hold under the room policy (prayers, school, pantry): it can't be asked for. */
const STANDING = /\b(fajr|zuhr|dhuhr|asr|maghrib|isha|jumu?'?ah|jummah|prayer|salah|school|al-?iman|an-?noor|al-?furqan|pantry|standing hold)\b/i;
export const isStandingTitle = (title: string) => STANDING.test(title);

/** Marketing asks for at least this many weeks of promotion before a public event. */
export const MARKETING_WEEKS = 2;
/** A description this long gives reviewers and the teams what they need. */
export const DESCRIPTION_GOOD = 200;

/** One entry on a room calendar, on one date. Times are "HH:MM" in Raleigh. */
export type BusyItem = {
  roomId: string;
  date: string;
  start: string;
  end: string;
  label: string;
  kind: "standing" | "booking" | "pending";
  /** The Google Calendar event (the series, for a repeating one). */
  eventId?: string;
  /** The portal request holding it, if it came from the portal. */
  cardId?: string;
  /** Who made a calendar-only entry. */
  organizerEmail?: string;
};

/** A booking the request clashes with, and on which of its dates. */
export type Clash = Omit<BusyItem, "date"> & { key: string; dates: string[] };

/** "card:EV-1101" or "cal:<event id>", the same key slot asks use. */
export const clashKey = (b: Pick<BusyItem, "cardId" | "eventId" | "label" | "start" | "end" | "kind">) =>
  b.cardId ? `card:${b.cardId}` : b.eventId && b.kind !== "standing" ? `cal:${b.eventId}` : `standing:${b.label}|${b.start}|${b.end}`;

/** Bookings the request's rooms and times run into, including setup and cleanup. */
export function findClashes(input: EventInput, rooms: Room[], busy: BusyItem[], opts: { excludeCard?: string; dates?: string[] } = {}): Clash[] {
  if (!input.rooms.length) return [];
  const dates = new Set(opts.dates ?? eventDates(input.date, input.recur));
  const ws = toMinutes(input.start) - input.setup;
  const we = toMinutes(input.end) + input.teardown;
  const mine = input.rooms.map((id) => roomById(rooms, id)).filter((r): r is Room => Boolean(r));
  const out = new Map<string, Clash>();
  for (const b of busy) {
    if (!dates.has(b.date) || (opts.excludeCard && b.cardId === opts.excludeCard)) continue;
    if (!mine.some((r) => roomsOverlap(r, roomById(rooms, b.roomId)))) continue;
    if (!(toMinutes(b.start) < we && ws < toMinutes(b.end))) continue;
    const key = clashKey(b);
    const c = out.get(key) ?? { ...b, key, dates: [] };
    if (!c.dates.includes(b.date)) c.dates.push(b.date);
    out.set(key, c);
  }
  return [...out.values()].map((c) => ({ ...c, dates: c.dates.sort() }));
}

/** Reasons mission review should look closely, from the plan. */
export function missionReasons(e: Pick<EventInput, "newProgram" | "outsideSpeaker" | "fundraiser" | "attendance" | "budget">): string[] {
  const r: string[] = [];
  if (e.newProgram) r.push("new program");
  if (e.outsideSpeaker) r.push("outside speaker or group");
  if (e.fundraiser) r.push("fundraiser");
  if (e.attendance >= 150) r.push(`${e.attendance} expected`);
  if (e.budget >= 2500) r.push(`budget $${e.budget.toLocaleString("en-US")}`);
  return r;
}

const afterHours = (e: Pick<EventInput, "start" | "end" | "setup" | "teardown">) => toMinutes(e.end) + e.teardown > 22 * 60 || toMinutes(e.start) - e.setup < 7 * 60;
export const isAfterHours = afterHours;

export type CheckContext = {
  rooms: Room[];
  busy: BusyItem[];
  today: string;
  rules: Partial<Record<string, boolean>>;
  /** Chairs, the office, the executive and admins may book restricted rooms. */
  mayBookRestricted: boolean;
  /** Editing an existing request: its own holds don't count. */
  excludeCard?: string;
  /** Moved to give up its time to this request: it can't take that time back. */
  gaveTo?: string;
};

export type CheckResult = { checks: Check[]; clashes: Clash[]; blocked: boolean };

const CAL = "IAR Google Calendar";
const MF = "Marketing request form";

export function eventChecks(e: EventInput, ctx: CheckContext): CheckResult {
  const out: Check[] = [];
  const add = (sev: Check["sev"], text: string, rule: string, block = false) => out.push(block ? { sev, text, rule, block } : { sev, text, rule });
  const s = toMinutes(e.start), en = toMinutes(e.end);
  const ws = s - e.setup, we = en + e.teardown;
  const picked = e.rooms.map((id) => roomById(ctx.rooms, id)).filter((r): r is Room => Boolean(r));

  if (en <= s) add("bad", "The end time has to be after the start time.", "", true);
  const dates = eventDates(e.date, e.recur);
  if (e.recur) {
    const RP = "Recurring reservations";
    const max = seriesMaxEnd(e.date);
    if (!e.recur.until) add("bad", "Pick an end date. Every series needs one.", RP, true);
    else if (e.recur.until < e.date) add("bad", "The end date can't be before the first date.", RP, true);
    else if (e.recur.until > max) add("bad", `A series can run at most ${SERIES_MAX_MONTHS} months from its first date, so the latest end date is ${longDate(max)}. Request the next period when it ends.`, RP, true);
    else add("info", `${dates.length} sessions, ${longDate(e.date)} to ${longDate(e.recur.until)}.`, RP);
  }

  const days = daysBetween(ctx.today, e.date);
  if (days < 0) add("bad", "That date has already passed.", "", true);

  let clashes: Clash[] = [];
  if (!picked.length) add("info", "Off-site event: no room to book.", "");
  else {
    clashes = findClashes(e, ctx.rooms, ctx.busy, { excludeCard: ctx.excludeCard });
    const many = dates.length > 1;
    for (const c of clashes) {
      const on = many ? `, on ${c.dates.length} of ${dates.length} dates (first: ${dayText(c.dates[0])})` : "";
      const room = roomById(ctx.rooms, c.roomId)?.name ?? "the room";
      if (ctx.gaveTo && c.key === ctx.gaveTo) {
        add("bad", `This still overlaps ${c.label}, which you gave this time to. Pick another time or room.`, "Room ask", true);
        continue;
      }
      const what = c.kind === "standing" ? "a standing hold under the room policy" : c.kind === "pending" ? "a request waiting for approval" : "booked on the IAR calendar";
      add("bad", `${room} overlaps ${c.label}, ${timeText(c.start)}–${timeText(c.end)}${on}: ${what}.`, CAL, true);
    }
    if (!clashes.length) {
      const names = picked.map((r) => r.name).join(" and ");
      add("ok", `${names} ${picked.length > 1 ? "are" : "is"} free on the IAR calendar, ${timeText(fromMinutes(ws))}–${timeText(fromMinutes(we))} including setup and cleanup${many ? `, on all ${dates.length} dates` : ""}.`, CAL);
    }
    if (ruleOn(ctx.rules, "gap")) {
      for (const r of picked.filter((x) => x.mph)) {
        const near = ctx.busy.filter((b) => {
          const br = roomById(ctx.rooms, b.roomId);
          if (b.kind === "standing" || !dates.includes(b.date) || !br?.mph || !roomsOverlap(r, br) || (ctx.excludeCard && b.cardId === ctx.excludeCard)) return false;
          const bs = toMinutes(b.start), be = toMinutes(b.end);
          return (be <= ws && ws - be < 120) || (bs >= we && bs - we < 120);
        });
        const seen = new Set<string>();
        for (const b of near) {
          if (seen.has(b.label)) continue;
          seen.add(b.label);
          add("warn", `Less than 2 hours between this and ${b.label} (${timeText(b.start)}–${timeText(b.end)}) in the MPH. It needs a cleaning gap.`, "Room policy §4");
        }
      }
    }
    if (ruleOn(ctx.rules, "capacity")) {
      const cap = picked.reduce((n, r) => n + r.capacity, 0);
      if (cap && e.attendance > cap) add("warn", `${e.attendance} expected, but ${picked.map((r) => r.name).join(" and ")} hold${picked.length > 1 ? "" : "s"} ${cap}.`, "Room capacity");
    }
    if (e.food && ruleOn(ctx.rules, "food")) {
      for (const r of picked.filter((x) => !x.food)) {
        const ok = ctx.rooms.filter((x) => x.bookable && x.food).map((x) => x.name);
        add("warn", `Food isn't allowed in ${r.name}.${ok.length ? ` Rooms that allow food: ${ok.join(", ")}.` : ""}`, "Room policy §8");
      }
    }
    if (ruleOn(ctx.rules, "restricted") && !ctx.mayBookRestricted) {
      for (const r of picked.filter((x) => x.restricted)) add("warn", `${r.name} can only be booked by leadership, imams or committee chairs.`, "Room policy §10");
    }
    for (const r of picked.filter((x) => x.note)) add("info", `${r.name}: ${r.note}`, "Room note");
    if (ruleOn(ctx.rules, "afterhours") && afterHours(e)) add("warn", "Starts before 7 AM or runs past 10 PM with setup and cleanup. After-hours security is needed (2-hour minimum, charged to the event).", "Room policy §3");
  }

  if (ruleOn(ctx.rules, "lead") && days >= 0) {
    if (days < 7) add("warn", `Only ${days} day${days === 1 ? "" : "s"} away. Mission review can take up to a week.`, "Room policy §4");
    else if (e.isPublic && days < 21) add("warn", `${days} days away. Marketing asks for 3 weeks to promote public events.`, MF);
    else add("ok", `${days} days of lead time.`, "Room policy §4");
  }

  const mr = missionReasons(e);
  if (mr.length) add("info", `Mission review will look closely at this: ${mr.join(", ")}.`, "Mission review");
  const dn = e.description.trim().length;
  if (dn < DESCRIPTION_GOOD) add("info", dn ? "A longer description helps. Say what happens, who it's for, the schedule and any speakers." : "Add a description. The reviewers, marketing and the teams all read it.", "Program Request Form");
  else add("ok", "The description gives reviewers enough to go on.", "Program Request Form");

  if (e.isPublic) {
    if (ruleOn(ctx.rules, "advert")) add("info", "Marketing starts after approval. No advertising before then.", "Room policy §4");
    const b = e.brief;
    const miss: string[] = [];
    if (!b?.text.trim()) miss.push("the announcement text");
    if (!b?.subtitle.trim()) miss.push("a one-line subtitle");
    if (!b?.startOn) miss.push("when to start marketing");
    if (e.registration && !b?.regLink.trim()) miss.push("the registration link");
    if (miss.length) add("bad", `Marketing needs ${miss.join(", ").replace(/, ([^,]*)$/, " and $1")}.`, MF, true);
    else if (b && b.startOn > e.date) add("bad", "Marketing has to start before the event.", MF, true);
    else if (b && daysBetween(b.startOn, e.date) < MARKETING_WEEKS * 7) add("warn", `Marketing starts ${daysBetween(b.startOn, e.date)} days before the event. Marketing asks for at least ${MARKETING_WEEKS} weeks.`, MF);
    if (b && b.subtitle.trim().split(/\s+/).length > 6) add("info", "Keep the one-line subtitle to 5 or 6 words. It goes on the flyer.", MF);
  }
  if (e.av && !(e.avNeeds?.kinds.length)) add("bad", "Choose the type of A/V support you need.", MF, true);

  return { checks: out, clashes, blocked: out.some((c) => c.block) };
}


/** Shown next to times in lists: "6:00–9:00 PM" style isn't needed; keep both ends explicit. */
export const windowText = (e: Pick<EventInput, "start" | "end" | "setup" | "teardown">) =>
  `${timeText(fromMinutes(toMinutes(e.start) - e.setup))}–${timeText(fromMinutes(toMinutes(e.end) + e.teardown))}`;
