/**
 * The automatic checks on an event request: the room calendar (the IAR
 * calendar is the source of truth) and the room policy. Most checks are
 * flags for the reviewers; a clash with a booking, a missing end date on a
 * series or missing marketing details stop the request. Admins can turn the
 * policy rules off in Portal Settings. Plain functions so they can be tested.
 */
import { type Room, roomById, roomsOverlap } from "./rooms";
import { SERIES_MAX_MONTHS, dayText, eventDates, fromMinutes, longDate, seriesMaxEnd, timeText, toMinutes } from "./series";
import type { Check, EventInput, TimeEdit } from "./types";
import { daysBetween } from "../dates";

/** Policy rules an admin can turn off. The calendar check can't be turned off. */
export const RULES = [
  { id: "gap", name: "MPH needs a 2-hour cleaning gap between events", policy: "Room policy §4" },
  { id: "capacity", name: "Attendance within the room's capacity", policy: "Room list" },
  { id: "food", name: "Food only in rooms that allow it", policy: "Room policy §8" },
  { id: "restricted", name: "Restricted rooms: leadership, imams and chairs only", policy: "Room policy §10" },
  { id: "lead", name: "Lead time: 1 week for review, 3 weeks for public events", policy: "Room policy §4 · Marketing form" },
  { id: "afterhours", name: "After-hours events (before 7 AM or after 10 PM)", policy: "Room policy §3" },
  { id: "advert", name: "No advertising until approved", policy: "Room policy §4" },
] as const;
export type RuleId = (typeof RULES)[number]["id"];

/** Rules are on unless an admin turned them off. */
export const ruleOn = (rules: Partial<Record<string, boolean>>, id: RuleId) => rules[id] !== false;


/** A description this long gives reviewers and the teams what they need. */
export const DESCRIPTION_GOOD = 200;

/** One entry on a room calendar, on one date. Times are "HH:MM" in Raleigh. */
export type BusyItem = {
  roomId: string;
  date: string;
  start: string;
  end: string;
  label: string;
  kind: "booking" | "pending";
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
  b.cardId ? `card:${b.cardId}` : b.eventId ? `cal:${b.eventId}` : `cal:${b.label}|${b.start}|${b.end}`;

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

/** The flags a requester ticked that everyone should notice, shown as pills on the event and in lists. */
export function eventFlags(e: Pick<EventInput, "food" | "outsideSpeaker" | "newProgram" | "fundraiser">): string[] {
  const f: string[] = [];
  if (e.food) f.push("Food served");
  if (e.outsideSpeaker) f.push("Outside speaker");
  if (e.newProgram) f.push("New program");
  if (e.fundraiser) f.push("Fundraiser");
  return f;
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
      const what = c.kind === "pending" ? "a request waiting for approval" : "booked on the IAR calendar";
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
          if (!dates.includes(b.date) || !br?.mph || !roomsOverlap(r, br) || (ctx.excludeCard && b.cardId === ctx.excludeCard)) return false;
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
    if (ruleOn(ctx.rules, "afterhours") && afterHours(e)) add("warn", "Starts before 7 AM or runs past 10 PM with setup and cleanup. Room policy requires after-hours security (2-hour minimum): arrange it with Safety & Security before the event.", "Room policy §3");
  }

  if (ruleOn(ctx.rules, "lead") && days >= 0) {
    if (days < 7) add("warn", `Only ${days} day${days === 1 ? "" : "s"} away. Review can take up to a week.`, "Room policy §4");
    else if (e.isPublic && days < 21) add("warn", `${days} days away. Marketing asks for 3 weeks to promote public events.`, MF);
    else add("ok", `${days} days of lead time.`, "Room policy §4");
  }

  const mr = missionReasons(e);
  if (mr.length) add("info", `The reviewers will look closely at this: ${mr.join(", ")}.`, "Review");
  const dn = e.description.trim().length;
  if (dn < DESCRIPTION_GOOD) add("info", dn ? "A longer description helps. Say what happens, who it's for, the schedule and any speakers." : "Add a description. The reviewers, marketing and the teams all read it.", "Program Request Form");
  else add("ok", "The description gives reviewers enough to go on.", "Program Request Form");

  if (e.isPublic) {
    if (ruleOn(ctx.rules, "advert")) add("info", "Marketing starts after approval. No advertising before then.", "Room policy §4");
    const b = e.brief;
    const miss: string[] = [];
    if (!b?.text.trim()) miss.push("the announcement text");
    if (!b?.subtitle.trim()) miss.push("a one-line subtitle");
    if (e.registration && !b?.regLink.trim()) miss.push("the registration link");
    if (miss.length) add("bad", `Marketing needs ${miss.join(", ").replace(/, ([^,]*)$/, " and $1")}.`, MF, true);
    if (b && b.subtitle.trim().split(/\s+/).length > 6) add("info", "Keep the one-line subtitle to 5 or 6 words. It goes on the flyer.", MF);
  }
  if (e.av && !(e.avNeeds?.kinds.length)) add("bad", "Choose the type of A/V support you need.", MF, true);

  return { checks: out, clashes, blocked: out.some((c) => c.block) };
}

/** Shown next to times in lists: "6:00–9:00 PM" style isn't needed; keep both ends explicit. */
export const windowText = (e: Pick<EventInput, "start" | "end" | "setup" | "teardown">) =>
  `${timeText(fromMinutes(toMinutes(e.start) - e.setup))}–${timeText(fromMinutes(toMinutes(e.end) + e.teardown))}`;

// ---- Fixing a small overlap yourself -----------------------------------------

/** An overlap this short or shorter gets a suggested fix. */
export const FIX_MINUTES = 30;

/** A change that clears every clash: "Start at 1:45 PM", applied with one click. */
export type QuickFix = { text: string; edit: TimeEdit };

const roundUp5 = (n: number) => Math.ceil(n / 5) * 5;
const roundDown5 = (n: number) => Math.floor(n / 5) * 5;

/**
 * Small changes that clear a clash of up to FIX_MINUTES: cut the setup (a
 * booking ending just after setup starts) or the cleanup (one starting just
 * before cleanup ends), or move the event later or earlier, keeping its
 * length. Each is checked against the calendar again, so it clears every
 * clash on every date and adds none; one that would run into after-hours
 * isn't offered. Empty when nothing small fixes it.
 */
export function quickFixes(e: EventInput, clashes: Pick<Clash, "start" | "end">[], ctx: { rooms: Room[]; busy: BusyItem[]; excludeCard?: string; gaveTo?: string }): QuickFix[] {
  if (!clashes.length) return [];
  const s = toMinutes(e.start), en = toMinutes(e.end);
  const ws = s - e.setup, we = en + e.teardown;
  const overlap = (c: Pick<Clash, "start" | "end">) => Math.min(we, toMinutes(c.end)) - Math.max(ws, toMinutes(c.start));
  if (clashes.some((c) => overlap(c) > FIX_MINUTES)) return [];
  const base: TimeEdit = { date: e.date, start: e.start, end: e.end, setup: e.setup, teardown: e.teardown };
  const tries: QuickFix[] = [];
  const shift = (by: number): TimeEdit => ({ ...base, start: fromMinutes(s + by), end: fromMinutes(en + by) });
  // Something ends during the setup (or a little into the event): start later, or set up for less time.
  const lastEnd = Math.max(...clashes.map((c) => toMinutes(c.end)));
  const firstStart = Math.min(...clashes.map((c) => toMinutes(c.start)));
  const late = roundUp5(lastEnd - ws);
  if (late > 0 && late <= FIX_MINUTES) tries.push({ text: `start at ${timeText(fromMinutes(s + late))}`, edit: shift(late) });
  if (lastEnd <= s && lastEnd > ws) {
    const setup = roundDown5(s - lastEnd);
    tries.push({ text: setup ? `cut setup to ${setup} min` : "skip the setup time", edit: { ...base, setup } });
  }
  // Something starts during the cleanup: end earlier, or clean up faster.
  const early = roundUp5(we - firstStart);
  if (early > 0 && early <= FIX_MINUTES) tries.push({ text: `start at ${timeText(fromMinutes(s - early))}`, edit: shift(-early) });
  if (firstStart >= en && firstStart < we) {
    const teardown = roundDown5(firstStart - en);
    tries.push({ text: teardown ? `cut cleanup to ${teardown} min` : "skip the cleanup time", edit: { ...base, teardown } });
  }
  const seen = new Set<string>();
  return tries.filter((f) => {
    const t = f.edit;
    const key = JSON.stringify(t);
    if (seen.has(key)) return false;
    seen.add(key);
    if (toMinutes(t.start) - t.setup < 0 || toMinutes(t.end) + t.teardown > 24 * 60) return false;
    if (afterHours(t) && !afterHours(e)) return false;
    const next = { ...e, ...t };
    return findClashes(next, ctx.rooms, ctx.busy, { excludeCard: ctx.excludeCard }).length === 0;
  });
}

/** "Start at 1:45 PM or cut setup to 15 min to remove the conflict." */
export function fixesText(fixes: QuickFix[], clashCount = 1): string {
  if (!fixes.length) return "";
  const list = fixes.map((f) => f.text);
  const joined = list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}` : list[0];
  return `${joined[0].toUpperCase()}${joined.slice(1)} to remove the conflict${clashCount > 1 ? "s" : ""}.`;
}
