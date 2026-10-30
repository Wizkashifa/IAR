/**
 * Marketing Requests rules, as plain functions over a card so they can be
 * tested without a server. Pages and server actions call these; they never
 * change a marketing card's stage themselves.
 *
 * The flow (docs/plan.md, Marketing requests): a new request waits for
 * someone on the marketing team to pick it up, as it comes in. They schedule
 * it with a done-by date, ask the requester a question (it comes back as new
 * when they answer),
 * or declines it with a reason. Scheduled work is started, then marked done.
 *
 * - The marketing team is whoever is on portal-team-marketing@ (role "marketing").
 * - A marketing member can submit a request, but someone else on the team
 *   reviews it (schedules, asks or declines). They can still do the work.
 * - Anyone on the team can hand scheduled or in-progress work to someone
 *   else on the team (or take it themselves).
 * - The requester answers questions, can edit the request until it's
 *   scheduled, and can cancel it until then.
 * - Portal admins can open every request for support but act only if they're
 *   on the marketing team themselves.
 * - Every step is written to the card's history.
 */
import type { Card, CardStatus } from "../cards";
import { ORG } from "../org";
import type { Actor } from "../purchases/workflow";
import { LEAD_DAYS, MARKETING_TYPES, eventPartOf, neededBy, pieceTitle, titleFor, type ParsedMarketing } from "./forms";
import { MAX_PER_REQUEST, filesOf } from "./files";
import { type MarketingDetails, type MarketingFile, type MarketingStage } from "./types";
import { same } from "../text";
import { addDays, daysBetween, isDate, todayLocal } from "../dates";
import { historyEntry, must, WorkflowError } from "../workflow-core";

export type { Actor };

export type MarketingCard = Card & { type: "marketing"; marketing: MarketingDetails };


export function isMarketingCard(c: Card | null | undefined): c is MarketingCard {
  return Boolean(c && c.type === "marketing" && c.marketing);
}

/** Today in Raleigh (YYYY-MM-DD) for an ISO time. */

/** "Nov 4" for a YYYY-MM-DD day. */
export const shortDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "Wednesday, November 4" for a YYYY-MM-DD day. */
export const longDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

// ---- Stages ----------------------------------------------------------------

/** The shared card status for a marketing stage. */
export function statusForStage(stage: MarketingStage): CardStatus {
  switch (stage) {
    case "review":
      return "submitted";
    case "question":
      return "changes_requested";
    case "scheduled":
    case "doing":
      return "approved";
    case "done":
      return "closed";
    case "declined":
      return "denied";
    case "cancelled":
      return "cancelled";
  }
}

/** Open stages: still waiting on someone. */
export const OPEN_STAGES: MarketingStage[] = ["review", "question", "scheduled", "doing"];

/** What the card is waiting on, in words, for My Requests and the lists. */
export function waitingOnFor(card: MarketingCard): string | undefined {
  const m = card.marketing;
  switch (m.stage) {
    case "review":
      return "Marketing: new request";
    case "question":
      return "You: answer marketing's question";
    case "scheduled":
      return m.doneBy ? `Marketing: due ${shortDay(m.doneBy)}` : "Marketing: scheduled";
    case "doing":
      return m.doneBy ? `Marketing: in progress, due ${shortDay(m.doneBy)}` : "Marketing: in progress";
    default:
      return undefined;
  }
}

/** Words search should find the request by: its type and its key answers. */
export function searchTextFor(m: MarketingDetails): string {
  const t = MARKETING_TYPES[m.kind];
  const a = m.answers;
  return [t.label, a.desc, a.text, a.url, a.from, a.to, a.first, a.last, a.title, m.requesterName]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 1500);
}

/** Days until the requester needs it, from `today`; null if the type doesn't ask. */
export function daysUntilNeeded(card: MarketingCard, today: string): number | null {
  const due = neededBy(card.marketing.answers);
  return due ? daysBetween(today, due) : null;
}

/** Needed sooner than marketing's usual 1–2 weeks, and still open. */
export function isTight(card: MarketingCard, today: string): boolean {
  const d = daysUntilNeeded(card, today);
  return d !== null && d < LEAD_DAYS && (card.marketing.stage === "review" || card.marketing.stage === "question");
}

// ---- Who can act -------------------------------------------------------------

export type Action = "schedule" | "ask" | "decline" | "start" | "finish" | "reschedule" | "assign" | "answer" | "edit" | "cancel" | "files";

/** Review decisions, which nobody makes on their own request. */
const REVIEW_ACTIONS: Action[] = ["schedule", "ask", "decline"];

/** Whether `actor` may take `action` now, and if not, why. */
export function permission(card: MarketingCard, actor: Actor, action: Action): { ok: true } | { ok: false; reason: string } {
  const m = card.marketing;
  const own = same(card.ownerEmail, actor.email);
  const no = (reason: string) => ({ ok: false as const, reason });

  if (action === "answer") {
    if (!own) return no("Only the requester can answer marketing's question.");
    if (m.stage !== "question") return no("Marketing hasn't asked a question.");
    return { ok: true };
  }
  if (action === "edit" || action === "cancel") {
    if (!own) return no(action === "edit" ? "Only the requester can change the request." : "Only the requester can cancel a request.");
    if (m.stage !== "review" && m.stage !== "question")
      return no(m.stage === "scheduled" || m.stage === "doing" ? "Marketing has already scheduled this. Add a comment to ask for a change." : "This request is closed.");
    return { ok: true };
  }

  if (action === "files") {
    if (!own && !actor.roles.includes("marketing")) return no("Only the requester and the marketing team can add files.");
    if (m.stage === "declined" || m.stage === "cancelled") return no("This request is closed, so no more files can be added.");
    return { ok: true };
  }

  if (!actor.roles.includes("marketing")) return no("This step is for the marketing team.");
  if (own && REVIEW_ACTIONS.includes(action)) return no("Someone else on the marketing team reviews your own request.");
  switch (action) {
    case "schedule":
    case "ask":
      return m.stage === "review" ? { ok: true } : no("This request isn't new any more.");
    case "decline":
      return m.stage === "review" || m.stage === "question" || m.stage === "scheduled" ? { ok: true } : no("This request can't be declined now.");
    case "start":
      return m.stage === "scheduled" ? { ok: true } : no("Only a scheduled request can be started.");
    case "finish":
      return m.stage === "doing" || m.stage === "scheduled" ? { ok: true } : no("This request isn't scheduled or in progress.");
    case "reschedule":
      return m.stage === "doing" || m.stage === "scheduled" ? { ok: true } : no("Only scheduled work has a done-by date to change.");
    case "assign":
      return m.stage === "doing" || m.stage === "scheduled" ? { ok: true } : no("Only scheduled or in-progress work can be handed to someone.");
  }
  return no("Unknown action.");
}

function mustDo(card: MarketingCard, actor: Actor, action: Action) {
  must(permission(card, actor, action));
}

/** New requests that `actor` can pick up (not their own). */
export function reviewableBy(cards: MarketingCard[], actor: Actor): MarketingCard[] {
  return cards.filter((c) => permission(c, actor, "schedule").ok);
}

// ---- Transitions ---------------------------------------------------------
// Each returns a new card; the caller saves it.

function withStage(card: MarketingCard, m: MarketingDetails, now: string): MarketingCard {
  const next: MarketingCard = { ...card, marketing: m, status: statusForStage(m.stage), updatedAt: now };
  next.waitingOn = waitingOnFor(next);
  next.searchText = searchTextFor(m);
  return next;
}

const moved = (m: MarketingDetails, stage: MarketingStage, now: string): MarketingDetails => ({ ...m, stage, stageSince: now });

/** A done-by date: a real day, today or later. */
function checkDoneBy(doneBy: string, now: string): string {
  const d = doneBy.trim();
  if (!isDate(d)) throw new WorkflowError("Pick the date marketing aims to finish by.");
  if (d < todayLocal(new Date(now))) throw new WorkflowError("The done-by date has already passed.");
  return d;
}

/** The note for history when a request is needed sooner than marketing's usual lead time. */
function tightNote(answers: Record<string, string>, now: string): string | undefined {
  const due = neededBy(answers);
  if (!due) return undefined;
  const days = daysBetween(todayLocal(new Date(now)), due);
  if (days >= LEAD_DAYS) return undefined;
  return `Needed in ${days} day${days === 1 ? "" : "s"}. Marketing usually takes 1–2 weeks, so this may not be ready in time.`;
}

/** A new request from checked form input, waiting for the team to pick it up. The store assigns the ID. */
export function newMarketing(details: ParsedMarketing, owner: Actor, now: string): MarketingCard {
  const m: MarketingDetails = {
    kind: details.kind,
    answers: details.answers,
    requesterName: owner.name,
    ...(details.driveLink ? { driveLink: details.driveLink } : {}),
    ...(details.notes ? { notes: details.notes } : {}),
    stage: "review",
    stageSince: now,
    history: [historyEntry(owner.email, now, "Submitted")],
  };
  const tight = tightNote(details.answers, now);
  if (tight) m.history.push(historyEntry("Portal", now, "Short notice", tight));
  const card: MarketingCard = {
    id: "",
    orgId: ORG.id,
    type: "marketing",
    title: titleFor(details.kind, details.answers),
    status: "submitted",
    ownerEmail: owner.email.toLowerCase(),
    committee: details.committee,
    createdAt: now,
    updatedAt: now,
    marketing: m,
  };
  return withStage(card, m, now);
}

/** Accept a new request, with the date marketing aims to finish by. */
export function schedule(card: MarketingCard, actor: Actor, now: string, doneBy: string, note?: string): MarketingCard {
  mustDo(card, actor, "schedule");
  const d = checkDoneBy(doneBy, now);
  const m: MarketingDetails = {
    ...moved(card.marketing, "scheduled", now),
    doneBy: d,
    remindedFor: undefined,
    history: [...card.marketing.history, historyEntry(actor.email, now, `Scheduled, to finish by ${longDay(d)}`, note?.trim() || undefined)],
  };
  return withStage(card, m, now);
}

/** Ask the requester something. It comes back as new when they answer. */
export function ask(card: MarketingCard, actor: Actor, now: string, question: string): MarketingCard {
  mustDo(card, actor, "ask");
  const q = question.trim();
  if (!q) throw new WorkflowError("Write your question for the requester.");
  const m: MarketingDetails = { ...moved(card.marketing, "question", now), question: q, history: [...card.marketing.history, historyEntry(actor.email, now, "Asked a question", q)] };
  return withStage(card, m, now);
}

/** The edits a requester can make: the answers, committee, Drive link and comments. */
export type MarketingEdit = ParsedMarketing;

function applyEdit(card: MarketingCard, edited: MarketingEdit | undefined): { card: MarketingCard; changed: boolean } {
  if (!edited) return { card, changed: false };
  if (edited.kind !== card.marketing.kind) throw new WorkflowError("The request type can't change. Cancel this one and start a new request.");
  const m = card.marketing;
  const changed =
    JSON.stringify(edited.answers) !== JSON.stringify(m.answers) ||
    edited.committee !== card.committee ||
    (edited.driveLink ?? "") !== (m.driveLink ?? "") ||
    (edited.notes ?? "") !== (m.notes ?? "");
  if (!changed) return { card, changed };
  return {
    changed,
    card: {
      ...card,
      // A piece for an event keeps the event's name in its title ("Flyer: Community Fall Dinner").
      title: m.kind === "event" ? pieceTitle(edited.answers.piece, eventPartOf(card.title)) : titleFor(m.kind, edited.answers),
      committee: edited.committee,
      marketing: { ...m, answers: edited.answers, driveLink: edited.driveLink, notes: edited.notes },
    },
  };
}

/** The requester answers marketing's question (and may edit the request too); it comes back to the team as new. */
export function answer(card: MarketingCard, actor: Actor, now: string, text: string, edited?: MarketingEdit): MarketingCard {
  mustDo(card, actor, "answer");
  const a = text.trim();
  if (!a) throw new WorkflowError("Write your answer to marketing's question.");
  const { card: base, changed } = applyEdit(card, edited);
  const history = [...base.marketing.history, historyEntry(actor.email, now, "Answered marketing's question", a)];
  if (changed) history.push(historyEntry(actor.email, now, "Edited the request"));
  const m: MarketingDetails = { ...moved(base.marketing, "review", now), question: undefined, history };
  return withStage(base, m, now);
}

/** The requester changes the request before it's scheduled. It stays where it is. */
export function edit(card: MarketingCard, actor: Actor, now: string, edited: MarketingEdit): MarketingCard {
  mustDo(card, actor, "edit");
  const { card: base, changed } = applyEdit(card, edited);
  if (!changed) throw new WorkflowError("Nothing changed.");
  const m: MarketingDetails = { ...base.marketing, history: [...base.marketing.history, historyEntry(actor.email, now, "Edited the request")] };
  return withStage(base, m, now);
}

/** Someone on the team starts the work. Whoever it was handed to keeps it; if nobody had it, the person starting it does. */
export function start(card: MarketingCard, actor: Actor, now: string, note?: string): MarketingCard {
  mustDo(card, actor, "start");
  const m: MarketingDetails = {
    ...moved(card.marketing, "doing", now),
    assignee: card.marketing.assignee ?? actor.email.toLowerCase(),
    history: [...card.marketing.history, historyEntry(actor.email, now, "Started", note?.trim() || undefined)],
  };
  return withStage(card, m, now);
}

/**
 * Hand scheduled or in-progress work to someone on the marketing team (or
 * take it yourself). `members`: everyone in the marketing team's Google
 * Group, by email. The stage doesn't change.
 */
export function assign(card: MarketingCard, actor: Actor, now: string, to: string, members: string[]): MarketingCard {
  mustDo(card, actor, "assign");
  const email = to.trim().toLowerCase();
  const m = card.marketing;
  if (!email) throw new WorkflowError("Choose who should work on it.");
  if (!members.some((x) => same(x, email))) throw new WorkflowError(`${email} isn't on the marketing team's Google Group.`);
  if (same(m.assignee, email)) throw new WorkflowError(`${same(email, actor.email) ? "You're" : `${email} is`} already working on it.`);
  const self = same(email, actor.email);
  const action = m.assignee ? `Handed from ${m.assignee} to ${self ? "themselves" : email}` : self ? "Took it" : `Assigned to ${email}`;
  return withStage(card, { ...m, assignee: email, history: [...m.history, historyEntry(actor.email, now, action)] }, now);
}

/** Change the done-by date of scheduled or in-progress work. A new date can get its own reminder. */
export function reschedule(card: MarketingCard, actor: Actor, now: string, doneBy: string, note?: string): MarketingCard {
  mustDo(card, actor, "reschedule");
  const d = checkDoneBy(doneBy, now);
  if (d === card.marketing.doneBy) throw new WorkflowError("That's already the done-by date.");
  const m: MarketingDetails = {
    ...card.marketing,
    doneBy: d,
    remindedFor: undefined,
    history: [...card.marketing.history, historyEntry(actor.email, now, `Done-by date changed to ${longDay(d)}`, note?.trim() || undefined)],
  };
  return withStage(card, m, now);
}

/** The work is finished. `note` can link the finished work. */
export function finish(card: MarketingCard, actor: Actor, now: string, note?: string): MarketingCard {
  mustDo(card, actor, "finish");
  const n = note?.trim() || undefined;
  const m: MarketingDetails = {
    ...moved(card.marketing, "done", now),
    doneNote: n,
    assignee: card.marketing.assignee ?? actor.email.toLowerCase(),
    history: [...card.marketing.history, historyEntry(actor.email, now, "Done", n)],
  };
  return withStage(card, m, now);
}

export function decline(card: MarketingCard, actor: Actor, now: string, reason: string): MarketingCard {
  mustDo(card, actor, "decline");
  const r = reason.trim();
  if (!r) throw new WorkflowError("Say why marketing can't take this on.");
  const m: MarketingDetails = { ...moved(card.marketing, "declined", now), declineReason: r, question: undefined, history: [...card.marketing.history, historyEntry(actor.email, now, "Declined", r)] };
  return withStage(card, m, now);
}

/** The requester or the marketing team adds files (already uploaded and checked with checkFiles). The stage doesn't change. */
export function addFiles(card: MarketingCard, actor: Actor, now: string, files: Omit<MarketingFile, "at" | "by">[]): MarketingCard {
  mustDo(card, actor, "files");
  if (files.length === 0) throw new WorkflowError("Choose a file first.");
  const had = filesOf(card.marketing);
  if (had.length + files.length > MAX_PER_REQUEST) throw new WorkflowError(`A request can have up to ${MAX_PER_REQUEST} files. For more, share a Google Drive folder instead.`);
  const by = actor.email.toLowerCase();
  const added = files.map((f) => ({ ...f, at: now, by }));
  const m: MarketingDetails = {
    ...card.marketing,
    files: [...had, ...added],
    history: [...card.marketing.history, historyEntry(actor.email, now, `Added ${files.length} file${files.length === 1 ? "" : "s"}`, files.map((f) => f.name).join(", "))],
  };
  return withStage(card, m, now);
}

export function cancel(card: MarketingCard, actor: Actor, now: string): MarketingCard {
  mustDo(card, actor, "cancel");
  const m: MarketingDetails = { ...moved(card.marketing, "cancelled", now), question: undefined, history: [...card.marketing.history, historyEntry(actor.email, now, "Cancelled by requester")] };
  return withStage(card, m, now);
}

/**
 * The portal cancels an open piece of marketing because its event was
 * cancelled or declined (lib/marketing/linked.ts). `why` goes in the history.
 */
export function cancelWithEvent(card: MarketingCard, now: string, why: string): MarketingCard {
  if (!OPEN_STAGES.includes(card.marketing.stage)) return card;
  const m: MarketingDetails = { ...moved(card.marketing, "cancelled", now), question: undefined, history: [...card.marketing.history, historyEntry("Portal", now, "Cancelled", why)] };
  return withStage(card, m, now);
}

/** The done-by date marketing would suggest when scheduling: when it's needed, or two weeks out. */
export function suggestedDoneBy(card: MarketingCard, today: string): string {
  const due = neededBy(card.marketing.answers);
  return due && due >= today ? due : addDays(today, LEAD_DAYS);
}

