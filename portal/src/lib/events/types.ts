/**
 * Events & Rooms: the fields an event card carries on top of the shared Card
 * (see lib/cards.ts). Design: docs/plan.md, "The event card".
 */

export type RecurFreq = "weekly" | "biweekly" | "monthly";

/** A repeating event. Every series has an end date (at most a few months on). */
export type Recurrence = { freq: RecurFreq; until: string };

/** Marketing questions from the Marketing/AV form, asked when the event is public. */
export type MarketingBrief = {
  subtitle: string;
  text: string;
  flyer: string;
  regLink: string;
  payment: string;
  /** "YYYY-MM-DD": when to start marketing. */
  startOn: string;
  files: string;
  /** The requester says the details are final, so marketing can publish them. */
  final: boolean;
};

/** A/V questions from the same form, asked when A/V support is checked. */
export type AvNeeds = { kinds: string[]; includes: string[]; ack: boolean };

/**
 * Where the request is. The shared Card.status follows from it (see
 * statusForStage in workflow.ts).
 *
 * slot → director → mission → approved → (close-out, closed)
 * "slot": waiting for an answer to an ask for a booked time; holds nothing yet.
 * "director": mission review by the committee's pillar director.
 * "mission": final mission review by any executive.
 */
export type EventStage = "slot" | "director" | "mission" | "approved" | "done";

export type HoldStatus = "tentative" | "confirmed";

/** The event's entry on one room's Google Calendar. */
export type CalendarHold = { roomId: string; calendarId: string; eventId: string; status: HoldStatus };

export type CheckSeverity = "ok" | "info" | "warn" | "bad";

/** One result of the automatic checks, shown on the form and kept for the reviewers. */
export type Check = { sev: CheckSeverity; text: string; rule: string; block?: boolean };

export type EventHistoryEntry = { at: string; by: string; action: string; note?: string };

export type EventApproval = { stage: "director" | "mission"; by: string; at: string };

/** What the requester filled in. */
export type EventInput = {
  title: string;
  description: string;
  /** The sponsoring committee's team group (portal-team-…@). */
  committeeGroup: string;
  committeeName: string;
  date: string;
  /** "HH:MM", Raleigh time. */
  start: string;
  end: string;
  /** Minutes held before and after for setup and cleanup. */
  setup: number;
  teardown: number;
  recur?: Recurrence;
  /** Room IDs (see rooms.ts). Empty: off-site, nothing to book. */
  rooms: string[];
  attendance: number;
  budget: number;
  food: boolean;
  isPublic: boolean;
  registration: boolean;
  av: boolean;
  setupNotes: string;
  newProgram: boolean;
  outsideSpeaker: boolean;
  fundraiser: boolean;
  brief?: MarketingBrief;
  avNeeds?: AvNeeds;
  teamNotes: string;
};

export type EventDetails = EventInput & {
  /** Every date it happens on, sorted (one for a one-time event), minus dates given up. */
  dates: string[];
  stage: EventStage;
  stageSince: string;
  approvals: EventApproval[];
  /** The requester accepted the room policy. */
  agreed: { name: string; at: string };
  /** The checks when it was last submitted, for the reviewers. */
  checks: Check[];
  holds: CalendarHold[];
  history: EventHistoryEntry[];
  /** Note from whoever sent it back or denied it. */
  returnNote?: string;
  /** Open ask for a booked time (SR-…) this request is waiting on. */
  waitingOnAsk?: string;
  /** Moved to give up its time for this ask: resubmitting needs only the director. */
  releasedFor?: string;
  /** Dates given up to someone else's ask. */
  released?: string[];
};
