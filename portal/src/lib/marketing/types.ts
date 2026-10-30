/**
 * Marketing Requests: the fields a marketing card carries on top of the
 * shared Card (see lib/cards.ts). Marketing work that isn't an event:
 * graphics, signs, announcements, highlights, webpages, redirects, badges.
 * Marketing for an event is one request per piece (kind "event"), linked to
 * its event (eventCardId; see lib/marketing/linked.ts).
 */
import type { HistoryEntry } from "../workflow-core";

/** The request types, as on today's Marketing/AV Google Form (see forms.ts for their questions). */
export const MARKETING_KINDS = ["graphic", "signage", "announce", "highlight", "webpage", "webedit", "redirect", "badge", "custom", "event"] as const;
export type MarketingKind = (typeof MARKETING_KINDS)[number];

/**
 * Where a request is:
 * - review ("New"): waiting for someone on the marketing team to pick it up
 * - question: marketing asked the requester something; it comes back to review when they answer
 * - scheduled: accepted, with a done-by date
 * - doing: someone on the team started it
 * - proof: marketing sent a draft; waiting on the requester's approval (or changes)
 * - ready: the requester approved the draft; marketing sends it out
 * - done (marketed), declined (with a reason), cancelled (by the requester, before it was scheduled)
 */
export type MarketingStage = "review" | "question" | "scheduled" | "doing" | "proof" | "ready" | "done" | "declined" | "cancelled";

export const STAGE_LABEL: Record<MarketingStage, string> = {
  review: "New",
  question: "Waiting on the requester",
  scheduled: "Scheduled",
  doing: "In progress",
  proof: "Waiting on approval",
  ready: "Approved",
  done: "Done",
  declined: "Declined",
  cancelled: "Cancelled",
};

/** Where finished marketing went out. */
export const CHANNELS = ["newsletter", "website", "screens", "instagram", "facebook", "whatsapp", "tiktok", "youtube"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABEL: Record<Channel, string> = {
  newsletter: "Newsletter",
  website: "Website",
  screens: "Lobby screens",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  youtube: "YouTube",
};

/** A file someone added to a request: logos, photos, wording, artwork. */
export type MarketingFile = {
  name: string;
  size: number;
  /** Google Drive file ID in the marketing Shared Drive folder (production). */
  driveFileId?: string;
  url?: string;
  at: string;
  by: string;
  /** A draft marketing sent for the requester's approval. */
  proof?: boolean;
};

export type MarketingDetails = {
  kind: MarketingKind;
  /** Answers to the type's questions, by field key (see forms.ts). Dates are YYYY-MM-DD. */
  answers: Record<string, string>;
  /** The requester's name when they submitted, for notices and the page. */
  requesterName: string;
  /** A Google Drive link to files for marketing. */
  driveLink?: string;
  /** Files added to the request, kept in the marketing Shared Drive folder (lib/marketing/files.ts). */
  files?: MarketingFile[];
  /** "Comments (optional)" from the form. */
  notes?: string;
  stage: MarketingStage;
  stageSince: string;
  /** When marketing aims to finish (YYYY-MM-DD), set when it's scheduled. */
  doneBy?: string;
  /** Who on the marketing team is working on it (set when someone starts it). */
  assignee?: string;
  /** Marketing's open question, while the request is with the requester. */
  question?: string;
  /** Why it was declined. */
  declineReason?: string;
  /** When marketing last sent a draft for approval (ISO time). */
  proofSentAt?: string;
  /** Marketing's note with the latest draft. */
  proofNote?: string;
  /** What the requester asked to change in the last draft, until a new one is sent. */
  changesAsked?: string;
  /** Where it went out, when marketing marked it done. */
  channels?: Channel[];
  /** A note or link marketing left when it finished. */
  doneNote?: string;
  /** The done-by date a "due soon" reminder was already sent for (so it goes once). */
  remindedFor?: string;
  /** When the request became new (`stageSince`) the last time the team was nudged about it, so it goes once. */
  nudgedFor?: string;
  history: HistoryEntry[];
  /** The event this piece is for (kind "event"): its title, dates, brief and images are read from the event, never copied. */
  eventCardId?: string;
};
