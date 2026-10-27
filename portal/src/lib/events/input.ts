/**
 * Reading the event request form: what the browser sends, checked and
 * turned into an EventInput. Plain functions so they can be tested.
 */
import { isTime, seriesMaxEnd } from "./series";
import type { AvNeeds, EventInput, MarketingBrief, RecurFreq } from "./types";
import { isDate } from "../dates";

export const AV_KINDS: Record<string, string> = { stream: "Live streaming", projector: "Projectors on projector screens", tv: "Displaying on TVs", sound: "Sound system support" };
export const AV_INCLUDES: Record<string, string> = { laptop: "A laptop presentation", video: "Videos with sound", mics: "More than one microphone", music: "Music or nasheeds" };

/** What the form posts, before checking. */
export type EventFormInput = Partial<Record<keyof EventInput, unknown>> & { recurFreq?: unknown; recurUntil?: unknown; agree?: unknown };

export type EventParseContext = {
  /** Team groups this person may request for, with their names. */
  committees: { group: string; name: string }[];
  /** Rooms that can be booked. */
  roomIds: string[];
  maxRooms?: number;
};

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bool = (v: unknown) => v === true || v === "on" || v === "true";
const num = (v: unknown, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};

export function parseEventInput(raw: EventFormInput, ctx: EventParseContext): { ok: true; input: EventInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const title = str(raw.title, 120);
  const description = str(raw.description, 4000);
  const group = str(raw.committeeGroup).toLowerCase();
  const committee = ctx.committees.find((c) => c.group === group);
  const date = str(raw.date, 10);
  const start = str(raw.start, 5);
  const end = str(raw.end, 5);
  if (!title) errors.push("Give the program a title.");
  if (!description) errors.push("Tell us about the event.");
  if (!committee) errors.push("Pick the sponsoring committee. You can request for committees you're on or direct.");
  if (!isDate(date)) errors.push("Pick a date.");
  if (!isTime(start) || !isTime(end)) errors.push("Enter when the event starts and ends.");

  const freq = str(raw.recurFreq) as RecurFreq | "none" | "";
  let recur: EventInput["recur"];
  if (freq === "weekly" || freq === "biweekly" || freq === "monthly") {
    const until = str(raw.recurUntil, 10);
    if (!isDate(until)) errors.push("Pick the date the series ends. Every series needs one.");
    else if (isDate(date) && until > seriesMaxEnd(date)) errors.push("That end date is too far out for one series.");
    recur = { freq, until };
  }

  const rooms = (Array.isArray(raw.rooms) ? raw.rooms : typeof raw.rooms === "string" && raw.rooms ? [raw.rooms] : []).map((r) => String(r)).filter((r, i, a) => r && a.indexOf(r) === i);
  const max = ctx.maxRooms ?? 3;
  if (rooms.length > max) errors.push(`Pick at most ${max} rooms.`);
  const unknown = rooms.filter((r) => !ctx.roomIds.includes(r));
  if (unknown.length) errors.push("One of the rooms can't be booked through the portal. Pick another, or ask the office.");

  const isPublic = bool(raw.isPublic);
  const registration = bool(raw.registration);
  const av = bool(raw.av);
  let brief: MarketingBrief | undefined;
  if (isPublic) {
    const b = (raw.brief ?? {}) as Partial<Record<keyof MarketingBrief, unknown>>;
    brief = {
      subtitle: str(b.subtitle, 80),
      text: str(b.text, 3000),
      flyer: str(b.flyer, 1500),
      regLink: str(b.regLink, 500),
      payment: str(b.payment, 1000),
      final: bool(b.final),
    };
    if (!brief.final) errors.push("Confirm the details are final, so marketing can publish them.");
  }
  let avNeeds: AvNeeds | undefined;
  if (av) {
    const a = (raw.avNeeds ?? {}) as Partial<Record<keyof AvNeeds, unknown>>;
    const list = (v: unknown, allowed: Record<string, string>) => (Array.isArray(v) ? v.map(String).filter((k) => k in allowed) : []);
    avNeeds = { kinds: list(a.kinds, AV_KINDS), includes: list(a.includes, AV_INCLUDES), ack: bool(a.ack) };
    if (!avNeeds.ack) errors.push("Confirm you understand A/V support isn't guaranteed.");
  }
  if (!bool(raw.agree)) errors.push("Accept the room reservation policy to submit.");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    input: {
      title,
      description,
      committeeGroup: committee!.group,
      committeeName: committee!.name,
      date,
      start,
      end,
      setup: num(raw.setup, 240),
      teardown: num(raw.teardown, 240),
      ...(recur ? { recur } : {}),
      rooms,
      attendance: Math.max(1, num(raw.attendance, 5000)),
      budget: num(raw.budget, 1_000_000),
      food: bool(raw.food),
      isPublic,
      registration,
      av,
      setupNotes: str(raw.setupNotes, 300),
      newProgram: bool(raw.newProgram),
      outsideSpeaker: bool(raw.outsideSpeaker),
      fundraiser: bool(raw.fundraiser),
      ...(brief ? { brief } : {}),
      ...(avNeeds ? { avNeeds } : {}),
      teamNotes: str(raw.teamNotes, 1000),
    },
  };
}

/**
 * A draft for the live checks while someone is still typing: whatever is
 * there, with safe defaults, and no errors (the checks explain what's wrong).
 * Null until there's a date and times. Never saved.
 */
export function draftInput(raw: EventFormInput, ctx: EventParseContext): EventInput | null {
  const date = str(raw.date, 10);
  const start = str(raw.start, 5);
  const end = str(raw.end, 5);
  if (!isDate(date) || !isTime(start) || !isTime(end)) return null;
  const freq = str(raw.recurFreq);
  const until = str(raw.recurUntil, 10);
  const rooms = (Array.isArray(raw.rooms) ? raw.rooms.map(String) : []).filter((r) => ctx.roomIds.includes(r));
  const b = (raw.brief ?? {}) as Partial<Record<keyof MarketingBrief, unknown>>;
  const a = (raw.avNeeds ?? {}) as Partial<Record<keyof AvNeeds, unknown>>;
  const group = str(raw.committeeGroup).toLowerCase();
  return {
    title: str(raw.title, 120),
    description: str(raw.description, 4000),
    committeeGroup: group,
    committeeName: ctx.committees.find((c) => c.group === group)?.name ?? "",
    date,
    start,
    end,
    setup: num(raw.setup, 240),
    teardown: num(raw.teardown, 240),
    ...(freq === "weekly" || freq === "biweekly" || freq === "monthly" ? { recur: { freq, until: isDate(until) ? until : "" } } : {}),
    rooms,
    attendance: num(raw.attendance, 5000),
    budget: num(raw.budget, 1_000_000),
    food: bool(raw.food),
    isPublic: bool(raw.isPublic),
    registration: bool(raw.registration),
    av: bool(raw.av),
    setupNotes: "",
    newProgram: bool(raw.newProgram),
    outsideSpeaker: bool(raw.outsideSpeaker),
    fundraiser: bool(raw.fundraiser),
    brief: bool(raw.isPublic) ? { subtitle: str(b.subtitle, 80), text: str(b.text, 3000), flyer: str(b.flyer), regLink: str(b.regLink, 500), payment: "", final: true } : undefined,
    avNeeds: bool(raw.av) ? { kinds: Array.isArray(a.kinds) ? a.kinds.map(String) : [], includes: [], ack: true } : undefined,
    teamNotes: "",
  };
}
