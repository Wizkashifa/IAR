/**
 * Events & Rooms: the fields an event card carries on top of the shared Card
 * (see lib/cards.ts). Design: docs/plan.md, "The event card".
 */
import type { HistoryEntry } from "../workflow-core";
import type { MarketingFile } from "../marketing/types";

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
  /** Older requests only: a Google Drive link to files. New requests upload images instead (EventDetails.images). */
  files?: string;
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
 * "director": Director review, by the committee's pillar director.
 * "mission": Executive review, the final review by any executive.
 * Names people see: STAGE_LABEL in workflow.ts (the same as the step bar's).
 */
export type EventStage = "slot" | "director" | "mission" | "approved" | "done";

export type HoldStatus = "tentative" | "confirmed";

/** The event's entry on one room's Google Calendar. */
export type CalendarHold = { roomId: string; calendarId: string; eventId: string; status: HoldStatus };

export type CheckSeverity = "ok" | "info" | "warn" | "bad";

/** One result of the automatic checks, shown on the form and kept for the reviewers. */
export type Check = { sev: CheckSeverity; text: string; rule: string; block?: boolean };


/** The parts of an event its requester can change on their own: when, and the setup and cleanup around it. For a series, `date` is its first date. */
export type TimeEdit = Pick<EventInput, "date" | "start" | "end" | "setup" | "teardown">;

/** A new date or time asked for on an approved event. The approved time stays booked until it's approved. */
export type TimeChange = TimeEdit & {
  /** The dates it would have, minus any given up. */
  dates: string[];
  by: string;
  at: string;
  /** The checks on the new time, for whoever approves it. */
  checks: Check[];
};

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

/**
 * The teams that get tasks on an approved event (lib/events/tasks.ts). Each is
 * a queue role. Committees set up and clean up their own events, so there is
 * no facilities task. "marketing": older events only; new events get marketing
 * pieces instead (lib/marketing/linked.ts).
 */
export type TaskTeam = "marketing" | "av";

/** "locked" until the event is approved; then to do → in progress → done. */
export type TaskStatus = "locked" | "todo" | "doing" | "done";

/** One team's job for the event (one for a whole series). */
export type EventTask = {
  id: string;
  team: TaskTeam;
  title: string;
  status: TaskStatus;
  /** Who on the team took it. */
  assignee?: string;
  /** "YYYY-MM-DD". */
  dueDate: string;
  /** Left by the team when they finished it. */
  note?: string;
  history: HistoryEntry[];
};

/** What the requester (or the office) filled in after the event. */
export type CloseOut = {
  attendance?: number;
  notes: string;
  /** The requester confirmed the final costs (the purchases linked to the event). */
  costsConfirmed: boolean;
  /** Spent, from the linked payment requests, when it was closed. */
  spent: number;
  /** A deposit should be refunded (the finance office was told). */
  depositRefund?: boolean;
  by: string;
  at: string;
  /** Closed by the office for the requester. */
  byOffice?: boolean;
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
  history: HistoryEntry[];
  /** Note from whoever sent it back or denied it. */
  returnNote?: string;
  /** Open ask for a booked time (SR-…) this request is waiting on. */
  waitingOnAsk?: string;
  /** Moved to give up its time for this ask: resubmitting needs only the director. */
  releasedFor?: string;
  /** Dates given up to someone else's ask. */
  released?: string[];
  /** A series' next period: the request it renews, and the request that renewed it. */
  renews?: string;
  renewedBy?: string;
  /** When the requester was told renewal is open (the daily job tells them once). */
  renewalNotified?: string;
  /** Team tasks, added when it's approved (lib/events/tasks.ts). */
  tasks?: EventTask[];
  /** When the event went to close-out, and when the requester was reminded. */
  closeOutSince?: string;
  closeOutNudged?: string;
  closeOut?: CloseOut;
  /** A new date or time waiting for approval, on an approved event (lib/events/reschedule.ts). */
  change?: TimeChange;
  /** Images for marketing (public events), in the marketing Shared Drive's "Event Requests / <date · event name>" folder. */
  images?: MarketingFile[];
};
