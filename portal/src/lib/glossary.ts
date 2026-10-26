/**
 * The words the portal uses for steps and actions, in one place, so every
 * module says the same thing. Request pages, lists and "What happens next"
 * (next-step.ts) read from here. Plain data, no I/O.
 */
import type { CardStatus } from "./cards";

/** Buttons and the history: what people do to a request. */
export const VERB = {
  send: "Send",
  sendAgain: "Send again",
  approve: "Approve",
  sendBack: "Send back",
  decline: "Decline",
  withdraw: "Withdraw",
  confirm: "Confirm it's fixed",
  reopen: "Reopen",
} as const;

/** Steps on the step bar, shared by every module that has them. */
export const STEP = {
  submitted: "Submitted",
  reported: "Reported",
  roomAnswer: "Room answer",
  chair: "Chair approval",
  finance: "Finance review",
  executiveApproval: "Executive approval",
  toPay: "To pay",
  paid: "Paid",
  quickbooks: "Entered in QuickBooks",
  director: "Director review",
  executiveReview: "Executive review",
  approved: "Approved",
  eventDay: "Event day",
  closeOut: "Close-out",
  closed: "Closed",
  weeklyReview: "Weekly review",
  scheduled: "Scheduled",
  inProgress: "In progress",
  done: "Done",
  pickedUp: "Picked up",
  beingWorkedOn: "Being worked on",
  fixed: "Fixed",
} as const;

/** A request that left the normal path: sent back, waiting on something, or stopped. */
export const FLAG = {
  sentBack: "Sent back for changes",
  question: "Question for the requester",
  declined: "Declined",
  withdrawn: "Withdrawn",
  waitingParts: "Waiting on parts",
  reopened: "Reopened",
} as const;

/** The line under a request that tells the requester they'll hear back. */
export const NOTIFIED = "You'll get a notification when it's done.";

/** The shared statuses every request has, in words. */
export const STATUS_LABEL: Record<CardStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
  paid: "Paid",
  close_out: "Close-out",
  closed: "Closed",
};
