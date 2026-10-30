/**
 * Marketing Requests rules, as plain functions over a card so they can be
 * tested without a server. Pages and server actions call these; they never
 * change a marketing card's stage themselves.
 *
 * The flow (docs/plan.md, Marketing requests): a new request waits for
 * someone on the marketing team to pick it up, as it comes in. They schedule
 * it with a done-by date, ask the requester a question (it comes back as new
 * when they answer),
 * or declines it with a reason. Scheduled work is started. Then marketing
 * sends the requester a draft to approve (everything but short links and
 * small website updates): the requester approves it or asks for changes,
 * and once it's approved marketing marks it as marketed, with where it went
 * out. If the requester doesn't answer by the same time on the next business
 * day, marketing can go ahead without their approval.
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
import { LEAD_DAYS, MARKETING_TYPES, neededBy, titleFor, type ParsedMarketing } from "./forms";
import { MAX_PER_REQUEST, filesOf } from "./files";
import { CHANNELS, CHANNEL_LABEL, type Channel, type MarketingDetails, type MarketingFile, type MarketingKind, type MarketingStage } from "./types";
import { same } from "../text";
import { addDays, daysBetween, isDate, nextBusinessDay, todayLocal } from "../dates";
import { fmtDayTime } from "../format";
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
    case "proof":
      return "changes_requested";
    case "scheduled":
    case "doing":
    case "ready":
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
export const OPEN_STAGES: MarketingStage[] = ["review", "question", "scheduled", "doing", "proof", "ready"];

/** Stages where the marketing team has the work: someone may be on it, with a done-by date. */
export const WORK_STAGES: MarketingStage[] = ["scheduled", "doing", "proof", "ready"];
export const isWorkStage = (stage: MarketingStage) => WORK_STAGES.includes(stage);

// ---- Approval ----------------------------------------------------------------

/** Kinds with nothing for the requester to approve: a short link and a small website update. */
export const NO_APPROVAL: MarketingKind[] = ["redirect", "webedit"];
/** Whether marketing sends the requester a draft to approve before it goes out. */
export const needsApproval = (kind: MarketingKind) => !NO_APPROVAL.includes(kind);

/** When marketing can go ahead without the requester's answer: the same time on the next business day after the draft was sent. */
export function approvalDue(m: MarketingDetails): string | undefined {
  return m.stage === "proof" && m.proofSentAt ? nextBusinessDay(m.proofSentAt) : undefined;
}

/** The files of the latest draft sent for approval. */
export function latestProof(m: MarketingDetails): MarketingFile[] {
  return m.proofSentAt ? filesOf(m).filter((f) => f.proof && f.at === m.proofSentAt) : [];
}

/** "Newsletter, Instagram and WhatsApp". */
export function channelText(channels: Channel[] | undefined): string {
  const names = (channels ?? []).map((c) => CHANNEL_LABEL[c]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

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
    case "proof":
      return "You: approve marketing's draft";
    case "ready":
      return "Marketing: approved, ready to go out";
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

export type Action = "schedule" | "ask" | "decline" | "start" | "sendProof" | "approve" | "changes" | "finish" | "reschedule" | "assign" | "answer" | "edit" | "cancel" | "files";

/** Review decisions, which nobody makes on their own request. */
const REVIEW_ACTIONS: Action[] = ["schedule", "ask", "decline"];

/**
 * Whether `actor` may take `action` now, and if not, why. `now` (an ISO
 * time) matters only for going ahead without the requester's approval.
 */
export function permission(card: MarketingCard, actor: Actor, action: Action, now: string = new Date().toISOString()): { ok: true } | { ok: false; reason: string } {
  const m = card.marketing;
  const own = same(card.ownerEmail, actor.email);
  const no = (reason: string) => ({ ok: false as const, reason });

  if (action === "answer") {
    if (!own) return no("Only the requester can answer marketing's question.");
    if (m.stage !== "question") return no("Marketing hasn't asked a question.");
    return { ok: true };
  }
  if (action === "approve" || action === "changes") {
    if (!own) return no("Only the requester can approve marketing's draft or ask for changes.");
    if (m.stage !== "proof") return no("Marketing hasn't sent a draft to approve.");
    return { ok: true };
  }
  if (action === "edit" || action === "cancel") {
    if (!own) return no(action === "edit" ? "Only the requester can change the request." : "Only the requester can cancel a request.");
    if (m.stage !== "review" && m.stage !== "question")
      return no(isWorkStage(m.stage) ? "Marketing has already scheduled this. Add a comment to ask for a change." : "This request is closed.");
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
    case "sendProof":
      if (!needsApproval(m.kind)) return no("This kind of request has nothing for the requester to approve.");
      return m.stage === "doing" ? { ok: true } : no("Start the work before sending a draft for approval.");
    case "finish":
      return finishPermission(m, now);
    case "reschedule":
      return isWorkStage(m.stage) ? { ok: true } : no("Only scheduled work has a done-by date to change.");
    case "assign":
      return isWorkStage(m.stage) ? { ok: true } : no("Only scheduled or in-progress work can be handed to someone.");
  }
  return no("Unknown action.");
}

/**
 * Marking it as marketed: once the requester approved the draft; straight
 * from scheduled or in progress for kinds with nothing to approve; or, while
 * the requester has the draft, once they haven't answered by the same time
 * on the next business day.
 */
function finishPermission(m: MarketingDetails, now: string): { ok: true } | { ok: false; reason: string } {
  switch (m.stage) {
    case "ready":
      return { ok: true };
    case "scheduled":
    case "doing":
      return needsApproval(m.kind) ? { ok: false, reason: "Send the requester a draft to approve first." } : { ok: true };
    case "proof": {
      const due = approvalDue(m);
      if (due && Date.parse(now) >= Date.parse(due)) return { ok: true };
      return { ok: false, reason: `The requester has until ${due ? fmtDayTime(due) : "the next business day"} to approve the draft. After that, you can go ahead without their approval.` };
    }
    default:
      return { ok: false, reason: "This request isn't scheduled or in progress." };
  }
}

function mustDo(card: MarketingCard, actor: Actor, action: Action, now?: string) {
  must(permission(card, actor, action, now));
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
      title: titleFor(m.kind, edited.answers),
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

/**
 * Marketing sends the requester a draft to approve: at least one file
 * (already uploaded and checked with checkFiles), kept on the request as
 * proof files, and an optional note. The requester has until the same time
 * on the next business day to answer.
 */
export function sendProof(card: MarketingCard, actor: Actor, now: string, files: Omit<MarketingFile, "at" | "by" | "proof">[], note?: string): MarketingCard {
  mustDo(card, actor, "sendProof");
  if (files.length === 0) throw new WorkflowError("Add the draft for the requester to look at.");
  const had = filesOf(card.marketing);
  if (had.length + files.length > MAX_PER_REQUEST) throw new WorkflowError(`A request can have up to ${MAX_PER_REQUEST} files. For more, share a Google Drive folder instead.`);
  const by = actor.email.toLowerCase();
  const n = note?.trim() || undefined;
  const m: MarketingDetails = {
    ...moved(card.marketing, "proof", now),
    files: [...had, ...files.map((f) => ({ ...f, at: now, by, proof: true }))],
    proofSentAt: now,
    proofNote: n,
    changesAsked: undefined,
    history: [...card.marketing.history, historyEntry(actor.email, now, "Sent for approval", [n, files.map((f) => f.name).join(", ")].filter(Boolean).join("\n"))],
  };
  return withStage(card, m, now);
}

/** The requester approves marketing's draft. Marketing sends it out next. */
export function approve(card: MarketingCard, actor: Actor, now: string, note?: string): MarketingCard {
  mustDo(card, actor, "approve");
  const m: MarketingDetails = { ...moved(card.marketing, "ready", now), history: [...card.marketing.history, historyEntry(actor.email, now, "Approved the draft", note?.trim() || undefined)] };
  return withStage(card, m, now);
}

/** The requester asks for changes to marketing's draft. It goes back to in progress, with what to change. */
export function askChanges(card: MarketingCard, actor: Actor, now: string, note: string): MarketingCard {
  mustDo(card, actor, "changes");
  const n = note.trim();
  if (!n) throw new WorkflowError("Say what marketing should change.");
  const m: MarketingDetails = { ...moved(card.marketing, "doing", now), changesAsked: n, history: [...card.marketing.history, historyEntry(actor.email, now, "Asked for changes", n)] };
  return withStage(card, m, now);
}

/**
 * Marketing marks it as marketed: where it went out (none for a badge or a
 * sign) and an optional note or link. Going ahead while the requester still
 * has the draft says so in the history.
 */
export function finish(card: MarketingCard, actor: Actor, now: string, note?: string, channels: string[] = []): MarketingCard {
  mustDo(card, actor, "finish", now);
  const unknown = channels.filter((c) => !(CHANNELS as readonly string[]).includes(c));
  if (unknown.length) throw new WorkflowError(`Pick where it went out from the list (not “${unknown[0]}”).`);
  const picked = CHANNELS.filter((c) => channels.includes(c));
  const n = note?.trim() || undefined;
  const was = card.marketing;
  const due = approvalDue(was);
  const action =
    was.stage === "proof" && due
      ? `Went ahead without the requester's approval (no answer by ${fmtDayTime(due)})`
      : was.stage === "ready"
        ? "Marked as marketed"
        : "Marked as marketed (nothing to approve)";
  const said = [picked.length ? `Went out on ${channelText(picked)}.` : undefined, n].filter(Boolean).join("\n") || undefined;
  const m: MarketingDetails = {
    ...moved(was, "done", now),
    doneNote: n,
    channels: picked.length ? picked : undefined,
    assignee: was.assignee ?? actor.email.toLowerCase(),
    history: [...was.history, historyEntry(actor.email, now, action, said)],
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

/** The done-by date marketing would suggest when scheduling: when it's needed, or two weeks out. */
export function suggestedDoneBy(card: MarketingCard, today: string): string {
  const due = neededBy(card.marketing.answers);
  return due && due >= today ? due : addDays(today, LEAD_DAYS);
}

