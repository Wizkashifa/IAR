/**
 * Where a request is and what happens next, for the step bar and the
 * "What happens next" line on every request page (docs/ux-plan.md 1.1).
 * Plain functions over a card: they read each module's own stages and never
 * change a request.
 *
 * nextStepText is written for the person looking. "You" means them, and only
 * when they are the one who acts; everyone else is named. The saved
 * `waitingOn` text says "You:" meaning the requester, so it's only right to
 * show it to the requester; pages use this instead.
 */
import type { Card } from "./cards";
import { reviewersFor, type EventCard } from "./events/workflow";
import { lastDate } from "./events/closeout";
import { TEAM_NAME as TASK_TEAM_NAME } from "./events/tasks";
import { shortDay } from "./marketing/workflow";
import { openExpectedReturns, purchaseTotal } from "./purchases/types";
import type { PurchaseCard } from "./purchases/workflow";
import type { MarketingCard } from "./marketing/workflow";
import { TEAM_NAME as TICKET_TEAM_NAME } from "./tickets/types";
import { AUTO_CLOSE_DAYS, type TicketCard } from "./tickets/workflow";
import { FLAG, NOTIFIED, STEP } from "./glossary";

export type StepState = "done" | "now" | "todo" | "skip";
export type Step = { label: string; state: StepState };
/** A request off the normal path: sent back or waiting (warn), or stopped (bad). */
export type StepFlag = { label: string; tone: "warn" | "bad" };
export type Steps = { steps: Step[]; flag?: StepFlag };

export type StepOptions = {
  /** Today in Raleigh (YYYY-MM-DD). Decides whether an event has happened. */
  today?: string;
  /** Dollars. A purchase at or above it shows the executive step before it gets there. */
  executiveThreshold?: number | null;
  /** The committee's directors, for an event. With none to review it, the director step shows as skipped. */
  directors?: string[];
};

/** Who is looking at the request. */
export type Viewer = { email: string };
/** A person's name from their address. */
export type NameOf = (email: string) => string;

const lc = (s: string) => s.trim().toLowerCase();
const same = (a?: string, b?: string) => Boolean(a && b && lc(a) === lc(b));
const raleighToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** "fatima.ahmed@islam1.org" → "Fatima Ahmed": what to show when the directory has no name. */
export function fallbackName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ") || email;
}

// ---- The step bar --------------------------------------------------------------

/** Labels in order, with the index of the step the request is on (`steps.length` when finished). */
function track(labels: string[], at: number, skip: string[] = []): Step[] {
  return labels.map((label, i) => ({ label, state: skip.includes(label) ? "skip" : i < at ? "done" : i === at ? "now" : "todo" }));
}

const stopped = (card: Card): StepFlag | undefined =>
  card.status === "denied" ? { label: FLAG.declined, tone: "bad" } : card.status === "cancelled" ? { label: FLAG.withdrawn, tone: "bad" } : undefined;

/** After a request stops, the steps it never reached are skipped. */
function stopAt(steps: Step[]): Step[] {
  return steps.map((s) => (s.state === "now" || s.state === "todo" ? { ...s, state: "skip" as const } : s));
}

function purchaseSteps(card: PurchaseCard, o: StepOptions): Steps {
  const p = card.purchase;
  if (p.kind === "card") {
    const labels = [STEP.submitted, STEP.finance, STEP.quickbooks];
    const at = { chair: 1, finance: 1, executive: 1, payment: 2, books: 2, done: 3 }[p.stage];
    return finishPurchase(card, track(labels, at));
  }
  const passed = new Set(p.approvals.map((a) => a.stage));
  const exec = p.stage === "executive" || passed.has("executive") || (o.executiveThreshold != null && purchaseTotal(p) >= o.executiveThreshold);
  const labels: string[] = [STEP.submitted, STEP.chair, STEP.finance, ...(exec ? [STEP.executiveApproval] : []), STEP.toPay, STEP.paid];
  const index = (l: string) => labels.indexOf(l);
  const at = {
    chair: index(STEP.chair),
    finance: index(STEP.finance),
    executive: index(STEP.executiveApproval),
    payment: index(STEP.toPay),
    books: labels.length,
    done: labels.length,
  }[p.stage];
  // Sent straight to finance: no chair could approve it.
  const skip = p.stage !== "chair" && !passed.has("chair") ? [STEP.chair] : [];
  return finishPurchase(card, track(labels, at, skip));
}

function finishPurchase(card: PurchaseCard, steps: Step[]): Steps {
  if (card.status === "changes_requested") return { steps, flag: { label: FLAG.sentBack, tone: "warn" } };
  const flag = stopped(card);
  return flag ? { steps: stopAt(steps), flag } : { steps };
}

function eventSteps(card: EventCard, o: StepOptions): Steps {
  const e = card.event;
  const today = o.today ?? raleighToday();
  const labels: string[] = [
    STEP.submitted,
    ...(e.stage === "slot" ? [STEP.roomAnswer] : []),
    STEP.director,
    STEP.executiveReview,
    STEP.approved,
    STEP.eventDay,
    STEP.closeOut,
    STEP.closed,
  ];
  const index = (l: string) => labels.indexOf(l);
  const passed = new Set(e.approvals.map((a) => a.stage));
  let at: number;
  if (card.status === "closed" || e.stage === "done") at = labels.length;
  else if (card.status === "close_out") at = index(STEP.closeOut);
  else if (e.stage === "approved") at = e.dates.length && lastDate(card) < today ? index(STEP.closeOut) : index(STEP.eventDay);
  else at = index({ slot: STEP.roomAnswer, director: STEP.director, mission: STEP.executiveReview }[e.stage]);
  const skip: string[] = [];
  const pastDirector = e.stage === "mission" || e.stage === "approved" || e.stage === "done";
  const noDirector = o.directors !== undefined && reviewersFor(card.ownerEmail, o.directors).length === 0;
  if ((pastDirector && !passed.has("director")) || (!pastDirector && e.stage !== "director" && noDirector)) skip.push(STEP.director);
  // Moved to give up its time: only the director approves the new time.
  if (e.releasedFor) skip.push(STEP.executiveReview);
  const steps = track(labels, at, skip);
  if (card.status === "changes_requested") return { steps, flag: { label: FLAG.sentBack, tone: "warn" } };
  const flag = stopped(card);
  return flag ? { steps: stopAt(steps), flag } : { steps };
}

function marketingSteps(card: MarketingCard): Steps {
  const m = card.marketing;
  const labels = [STEP.submitted, STEP.weeklyReview, STEP.scheduled, STEP.inProgress, STEP.done];
  const at = { review: 1, question: 1, scheduled: 2, doing: 3, done: 5, declined: 1, cancelled: 1 }[m.stage];
  const steps = track(labels, at);
  if (m.stage === "question") return { steps, flag: { label: FLAG.question, tone: "warn" } };
  if (m.stage === "declined") return { steps: stopAt(steps), flag: { label: FLAG.declined, tone: "bad" } };
  if (m.stage === "cancelled") return { steps: stopAt(steps), flag: { label: FLAG.withdrawn, tone: "bad" } };
  return { steps };
}

function ticketSteps(card: TicketCard): Steps {
  const t = card.ticket;
  const labels = [STEP.reported, STEP.pickedUp, STEP.beingWorkedOn, STEP.fixed, STEP.closed];
  const at = { new: 1, assigned: 2, in_progress: 2, waiting_parts: 2, reopened: 2, resolved: 4, closed: 5, cancelled: 1 }[t.status];
  const steps = track(labels, at);
  if (t.status === "waiting_parts") return { steps, flag: { label: FLAG.waitingParts, tone: "warn" } };
  if (t.status === "reopened") return { steps, flag: { label: FLAG.reopened, tone: "warn" } };
  if (t.status === "cancelled") return { steps: stopAt(steps), flag: { label: FLAG.withdrawn, tone: "bad" } };
  return { steps };
}

/** The step bar for a request: its module's own steps, which one it's on, and any flag. */
export function stepsFor(card: Card, o: StepOptions = {}): Steps {
  if (card.purchase) return purchaseSteps(card as PurchaseCard, o);
  if (card.event) return eventSteps(card as EventCard, o);
  if (card.marketing) return marketingSteps(card as MarketingCard);
  if (card.ticket) return ticketSteps(card as TicketCard);
  // Anything without its own steps (rentals, later): the shared statuses.
  const labels = [STEP.submitted, "In review", STEP.approved, STEP.closed];
  const at = { draft: 0, submitted: 1, in_review: 1, changes_requested: 1, approved: 2, paid: 3, close_out: 3, closed: 4, denied: 1, cancelled: 1 }[card.status];
  const steps = track(labels, at);
  if (card.status === "changes_requested") return { steps, flag: { label: FLAG.sentBack, tone: "warn" } };
  const flag = stopped(card);
  return flag ? { steps: stopAt(steps), flag } : { steps };
}

// ---- What happens next ---------------------------------------------------------

/**
 * Speaking about one person: "You" for the viewer, their name for anyone else,
 * with the verb to match ("You approve" / "Fatima Ahmed approves").
 */
function speaker(viewer: Viewer, names: NameOf) {
  const name = (email: string) => (same(email, viewer.email) ? "You" : names(email) || fallbackName(email));
  return {
    name,
    /** `who` does `you`/`they` ("approve"/"approves"). */
    does: (email: string, you: string, they: string) => `${name(email)} ${same(email, viewer.email) ? you : they}`,
    /** Several people, any of whom can act: "Ali Khan or Sara Malik". */
    anyOf: (emails: string[]) => {
      const ns = emails.map(name);
      return ns.length > 1 ? `${ns.slice(0, -1).join(", ")} or ${ns[ns.length - 1]}` : ns[0] ?? "";
    },
  };
}

const quoted = (note?: string) => (note ? ` (“${note.trim()}”)` : "");

function purchaseNext(card: PurchaseCard, viewer: Viewer, names: NameOf): string {
  const p = card.purchase;
  const s = speaker(viewer, names);
  const mine = same(card.ownerEmail, viewer.email);
  const notified = mine ? ` ${NOTIFIED}` : "";
  if (card.status === "changes_requested") return `${s.does(card.ownerEmail, "make", "makes")} the changes asked for${quoted(p.returnNote)} and ${mine ? "send" : "sends"} it again.`;
  if (card.status === "denied" || card.status === "cancelled") return "";
  switch (p.stage) {
    case "chair":
      return `${p.approverEmail ? s.does(p.approverEmail, "approve", "approves") : "The committee's chair approves"} it for ${card.committee || p.fund}, then the finance office reviews it.${notified}`;
    case "finance":
      return p.kind === "card"
        ? `The finance office checks the charges and receipts, then enters them in QuickBooks.${notified}`
        : `The finance office checks the receipts and accounts, then it's paid.${notified}`;
    case "executive":
      return `An executive approves it, then the finance office pays it.${notified}`;
    case "payment":
      return `The finance office pays ${p.payee || "it"}.${mine ? " You'll get a notification when it's paid." : ""}`;
    case "books":
      return "The finance office enters it in QuickBooks.";
    case "done": {
      const open = openExpectedReturns(p).length;
      return open ? `The finance office records the ${open} refund${open === 1 ? "" : "s"} or repayment${open === 1 ? "" : "s"} still owed.` : "";
    }
  }
}

function eventNext(card: EventCard, viewer: Viewer, names: NameOf, o: StepOptions): string {
  const e = card.event;
  const s = speaker(viewer, names);
  const mine = same(card.ownerEmail, viewer.email);
  const notified = mine ? ` ${NOTIFIED}` : "";
  if (card.status === "changes_requested")
    return e.releasedFor
      ? `${s.does(card.ownerEmail, "pick", "picks")} a new time. Only the director needs to approve it.`
      : `${s.does(card.ownerEmail, "make", "makes")} the changes asked for${quoted(e.returnNote)} and ${mine ? "send" : "sends"} it again.`;
  if (card.status === "close_out") return `${s.does(card.ownerEmail, "add", "adds")} the attendance and final costs to close it out.`;
  if (card.status === "denied" || card.status === "cancelled" || card.status === "closed") return "";
  switch (e.stage) {
    case "slot":
      return `Whoever holds the booked time answers ${mine ? "your" : "the"} ask for it. If they give it up, the request goes on to review.${notified}`;
    case "director": {
      const who = reviewersFor(card.ownerEmail, o.directors ?? []);
      const reviewer = who.length ? `${s.anyOf(who)} (director)` : "The committee's director";
      const one = who.some((d) => same(d, viewer.email));
      return e.releasedFor
        ? `${reviewer} ${one ? "approve" : "approves"} the new time. There's no executive review, because it moved to give up its time.${notified}`
        : `${reviewer} ${one ? "review" : "reviews"} it against IAR's mission, then an executive gives final approval.${notified}`;
    }
    case "mission":
      return `An executive gives final approval. Then the room is confirmed on the IAR calendar and the teams get their tasks.${notified}`;
    case "approved": {
      const open = (e.tasks ?? []).filter((t) => t.status !== "done").map((t) => TASK_TEAM_NAME[t.team]);
      const teams = open.length ? `${open.length > 1 ? `${open.slice(0, -1).join(", ")} and ${open[open.length - 1]} get` : `${open[0]} gets`} it ready. ` : "";
      return `${teams}After the event, ${s.does(card.ownerEmail, "add", "adds").replace(/^You /, "you ")} the attendance and ${mine ? "close" : "closes"} it out.`;
    }
    case "done":
      return "";
  }
}

function marketingNext(card: MarketingCard, viewer: Viewer, names: NameOf): string {
  const m = card.marketing;
  const s = speaker(viewer, names);
  const mine = same(card.ownerEmail, viewer.email);
  const by = m.doneBy ? `, to be done by ${shortDay(m.doneBy)}` : "";
  switch (m.stage) {
    case "review":
      return `The marketing team looks at new requests in its weekly review.${mine ? ` ${NOTIFIED}` : ""}`;
    case "question":
      return `${s.does(card.ownerEmail, "answer", "answers")} the marketing team's question${quoted(m.question)}.`;
    case "scheduled":
      return `The marketing team has it scheduled${by}.`;
    case "doing":
      return m.assignee ? `${s.does(m.assignee, "are working", "is working")} on it${by}.` : `The marketing team is working on it${by}.`;
    default:
      return "";
  }
}

function ticketNext(card: TicketCard, viewer: Viewer, names: NameOf): string {
  const t = card.ticket;
  const s = speaker(viewer, names);
  const mine = same(card.ownerEmail, viewer.email);
  const team = `The ${TICKET_TEAM_NAME[t.team]} team`;
  const who = (you: string, they: string) => (t.assigneeEmail ? s.does(t.assigneeEmail, you, they) : `${team} ${they}`);
  switch (t.status) {
    case "new":
      return `${team} picks it up.${mine ? " You'll get a notification when it's fixed." : ""}`;
    case "assigned":
      return `${who("start", "starts")} the work.`;
    case "in_progress":
      return `${who("are working", "is working")} on it.`;
    case "waiting_parts":
      return `${who("are waiting", "is waiting")} on parts.`;
    case "reopened":
      return `${who("take", "takes")} another look.`;
    case "resolved":
      return mine
        ? `Check it's fixed and confirm, or reopen it. It closes by itself after ${AUTO_CLOSE_DAYS} days.`
        : `${s.name(card.ownerEmail)} checks it's fixed and confirms. It closes by itself after ${AUTO_CLOSE_DAYS} days.`;
    default:
      return "";
  }
}

/**
 * One sentence on who acts next and what follows, for the person looking.
 * Empty when nothing more happens (finished, declined or withdrawn).
 * `names` turns an address into a name (lib/names.ts); pass `fallbackName` until it exists.
 */
export function nextStepText(card: Card, viewer: Viewer, names: NameOf = fallbackName, o: StepOptions = {}): string {
  if (card.purchase) return purchaseNext(card as PurchaseCard, viewer, names);
  if (card.event) return eventNext(card as EventCard, viewer, names, o);
  if (card.marketing) return marketingNext(card as MarketingCard, viewer, names);
  if (card.ticket) return ticketNext(card as TicketCard, viewer, names);
  return "";
}
