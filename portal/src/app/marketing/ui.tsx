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
};

/** What a `?ok=` from a server action says, as a short confirmation. */
export const OK_MESSAGES: Record<string, string> = {
  edit: "Changes saved.",
  answer: "Answer sent. The request is back in marketing's weekly review.",
  schedule: "Scheduled. The requester is told the done-by date.",
  ask: "Question sent to the requester.",
  decline: "Declined. The requester is told why.",
  start: "Started. It shows as in progress, with you working on it.",
  reschedule: "Done-by date changed. The requester is told.",
  finish: "Marked done. The requester is told.",
  cancel: "Request cancelled.",
  commented: "Comment added. The people on this request can see it.",
  files: "Files added. Marketing can open them from this page.",
};
