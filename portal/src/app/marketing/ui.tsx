import type { IconName } from "@/components/Icon";
import type { MarketingKind } from "@/lib/marketing/types";

/** An icon for each request type, on the type picker. */
export const TYPE_ICON: Record<MarketingKind, IconName> = {
  graphic: "star",
  signage: "flag",
  announce: "megaphone",
  highlight: "heart",
  webpage: "monitor",
  webedit: "sliders",
  redirect: "repeat",
  badge: "book",
  custom: "message",
  event: "calendar",
};

/** What a `?ok=` from a server action says, as a short confirmation. */
export const OK_MESSAGES: Record<string, string> = {
  edit: "Changes saved.",
  answer: "Answer sent. The request is back with the marketing team.",
  schedule: "Scheduled. The requester is told the done-by date.",
  ask: "Question sent to the requester.",
  decline: "Declined. The requester is told why.",
  start: "Started. It shows as in progress, with you working on it.",
  reschedule: "Done-by date changed. The requester is told.",
  assign: "Handed over. They're notified, and their name shows on the request.",
  finish: "Marked done. The requester is told, with where it went out.",
  sendProof: "Draft sent. The requester is asked to approve it by the same time on the next business day.",
  approve: "Approved. Marketing sends it out next.",
  changes: "Sent to marketing. They make the changes and send you a new draft.",
  cancel: "Request cancelled.",
  files: "Files added. Marketing can open them from this page.",
};
