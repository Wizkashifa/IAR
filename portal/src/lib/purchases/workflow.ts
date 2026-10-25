/**
 * Purchase Requests approval rules, as plain functions over a card so they
 * can be tested without a server. Pages and server actions call these; they
 * never change a purchase card's stage themselves.
 *
 * Controls built in:
 * - Nobody approves, pays or books their own request.
 * - A chair's own request goes to another chair, then a vice chair; it is never skipped.
 * - Requests at or above the executive threshold need executive approval.
 * - Card receipts get an after-the-fact finance review (the money is spent).
 * - Social & Welfare requests are restricted to S&W and finance.
 * - A fund's chairs, vice chairs and directors can see its requests (directors not S&W's).
 * - Co-chairs: the request names one chair; any other chair of the fund's team can act too.
 * - A director can take the chair step for their committees, alongside the
 *   chair. A fund with no usable chair goes to its director before finance.
 *   Never on S&W requests, and never on one's own request.
 * - Someone covering for an away chair (see lib/away.ts) acts on that chair's
 *   step only, and the history records whose approval it was.
 * - Every step is written to the card's history.
 */
import type { Card, CardStatus } from "../cards";
import { ORG, type Role } from "../org";
import { SOCIAL_WELFARE_FUND } from "./accounts";
import type { ParseResult } from "./input";
import {
  type Attachment,
  type HistoryEntry,
  type PurchaseDetails,
  type PurchaseStage,
  STAGE_LABEL,
  openExpectedReturns,
  purchaseTotal,
} from "./types";

export type RoutingSettings = {
  /** From the team groups that charge this fund (see teams.ts): Owners, Managers, pillar Owners. */
  approversFor(fund: string): { chairs?: string[]; backups?: string[]; directors?: string[] };
  /** Dollars. Null: no executive step (threshold not decided yet). */
  executiveThreshold: number | null;
};

/**
 * Who is acting. `roles` must be the roles from the person's own groups, not
 * the admin "see everything" expansion: being a portal admin is a support
 * role and does not let anyone approve or pay.
 */
export type Actor = {
  email: string;
  name: string;
  roles: Role[];
  /** People who are away and asked this person to cover their approvals today. */
  covering?: string[];
  /** Funds whose requests this person may open: ones they chair, vice-chair or direct (see teams.ts). */
  oversees?: string[];
  /** Funds this person chairs: as a co-chair they can take the chair step even when another chair is named. */
  chairs?: string[];
  /** Funds this person directs: they can take the chair step on them. */
  directs?: string[];
  /** Team groups this person chairs, vice-chairs or directs: they can open those committees' requests. */
  leads?: string[];
};

export type PurchaseCard = Card & { type: "purchase"; purchase: PurchaseDetails };

export class WorkflowError extends Error {}

const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** Whether `actor` is taking this chair step as the fund's director rather than as the named approver. */
export function approvingAsDirector(card: PurchaseCard, actor: Actor): boolean {
  const p = card.purchase;
  if (p.stage !== "chair" || p.restricted || same(p.approverEmail, actor.email)) return false;
  return Boolean(actor.directs?.includes(p.fund));
}

/** Whether `actor` is taking this chair step as one of the fund's other chairs. */
export function approvingAsCoChair(card: PurchaseCard, actor: Actor): boolean {
  const p = card.purchase;
  if (p.stage !== "chair" || same(p.approverEmail, actor.email)) return false;
  return Boolean(actor.chairs?.includes(p.fund));
}

/** The away approver `actor` is standing in for on this request, if they aren't the approver themselves. */
export function coveringApprover(card: PurchaseCard, actor: Actor): string | undefined {
  const p = card.purchase;
  if (p.stage !== "chair" || !p.approverEmail || same(p.approverEmail, actor.email)) return undefined;
  return actor.covering?.some((e) => same(e, p.approverEmail)) ? p.approverEmail : undefined;
}

export function isPurchaseCard(c: Card | null | undefined): c is PurchaseCard {
  return Boolean(c && c.type === "purchase" && c.purchase);
}

// ---- Visibility ----------------------------------------------------------

/**
 * Full detail (payee, lines, files). Restricted requests: S&W, finance, and the
 * people on the request. Pass the person's own group roles (not the admin
 * expansion); `seeAll` lets portal admins open unrestricted requests for support.
 */
export function canViewDetail(card: PurchaseCard, viewer: Actor & { seeAll?: boolean }): boolean {
  const p = card.purchase;
  const involved =
    same(card.ownerEmail, viewer.email) ||
    same(p.approverEmail, viewer.email) ||
    Boolean(coveringApprover(card, viewer)) ||
    p.approvals.some((a) => same(a.by, viewer.email));
  if (p.restricted) return involved || viewer.roles.includes("finance") || viewer.roles.includes("sw");
  return (
    involved ||
    Boolean(viewer.oversees?.includes(p.fund)) ||
    Boolean(viewer.seeAll) ||
    viewer.roles.some((r) => r === "finance" || r === "office" || r === "executive")
  );
}

// ---- Routing ---------------------------------------------------------------

type Route = { stage: PurchaseStage; approverEmail?: string; note?: string };

/** Where a newly submitted (or resubmitted) request goes first. */
function firstRoute(p: PurchaseDetails, ownerEmail: string, s: RoutingSettings): Route {
  if (p.kind === "card") return { stage: "finance", note: "Card receipts go to finance review." };
  const { chairs = [], backups = [], directors = [] } = s.approversFor(p.fund);
  const ownerChairs = chairs.some((c) => same(c, ownerEmail));
  const chair = chairs.find((c) => !same(c, ownerEmail));
  const backup = backups.find((b) => !same(b, ownerEmail));
  const director = p.fund === SOCIAL_WELFARE_FUND ? undefined : directors.find((d) => !same(d, ownerEmail));
  if (chair) return ownerChairs ? { stage: "chair", approverEmail: chair, note: "Requester is one of the committee's chairs, so it goes to another chair." } : { stage: "chair", approverEmail: chair };
  if (backup)
    return { stage: "chair", approverEmail: backup, note: ownerChairs ? "Requester is the committee's chair, so it goes to the vice chair." : "The committee has no chair, so it goes to the vice chair." };
  if (director)
    return { stage: "chair", approverEmail: director, note: ownerChairs ? "Requester is the committee's chair, so it goes to the committee's director." : "The committee has no chair, so it goes to the committee's director." };
  if (!ownerChairs) return { stage: "finance", note: "The committee has no chair yet; finance reviews it." };
  return { stage: "finance", note: "Requester is the committee's chair and there's no vice chair or director; finance reviews it." };
}

function nextStage(p: PurchaseDetails, s: RoutingSettings): PurchaseStage {
  switch (p.stage) {
    case "chair":
      return "finance";
    case "finance":
      if (p.kind === "card") return "books";
      if (s.executiveThreshold !== null && purchaseTotal(p) >= s.executiveThreshold) return "executive";
      return "payment";
    case "executive":
      return "payment";
    case "payment":
      return "books";
    case "books":
    case "done":
      return "done";
  }
}

/** The shared card status for a purchase stage. */
export function statusForStage(stage: PurchaseStage): CardStatus {
  switch (stage) {
    case "chair":
    case "finance":
    case "executive":
      return "in_review";
    case "payment":
      return "approved";
    case "books":
      return "paid";
    case "done":
      return "closed";
  }
}

/** What the card is waiting on, in words, for My Requests and the queues. */
export function waitingOnFor(card: PurchaseCard): string | undefined {
  const p = card.purchase;
  if (card.status === "changes_requested") return `You: ${p.returnNote ?? "make the requested changes"}`;
  if (card.status === "denied" || card.status === "cancelled") return undefined;
  const why = waitingOnStep(p);
  return why && p.returnNote && p.stage !== "done" ? `${why} (sent back: ${p.returnNote})` : why;
}

function waitingOnStep(p: PurchaseDetails): string | undefined {
  switch (p.stage) {
    case "chair":
      return p.approverEmail ? `Chair approval: ${p.approverEmail}` : "Chair approval";
    case "finance":
      return "Finance office";
    case "executive":
      return "Executive approval";
    case "payment":
      return "Finance office: payment";
    case "books":
      return "Finance office: QuickBooks entry";
    case "done": {
      const open = openExpectedReturns(p).length;
      return open ? `Finance office: ${open} refund/repayment${open === 1 ? "" : "s"} outstanding` : undefined;
    }
  }
}

// ---- Who can act ---------------------------------------------------------

export type Action = "approve" | "return" | "reject" | "pay" | "books" | "resolve" | "cancel" | "resubmit";

/** Whether `actor` may take `action` now, and if not, why. */
export function permission(card: PurchaseCard, actor: Actor, action: Action): { ok: true } | { ok: false; reason: string } {
  const p = card.purchase;
  const own = same(card.ownerEmail, actor.email);
  const no = (reason: string) => ({ ok: false as const, reason });
  const has = (r: Role) => actor.roles.includes(r);
  const closed = card.status === "denied" || card.status === "cancelled";

  if (action === "cancel") {
    if (!own) return no("Only the requester can cancel a request.");
    if (closed) return no("This request is already closed.");
    if (p.stage === "payment" || p.stage === "books" || p.stage === "done")
      return no("Approved or paid requests can't be cancelled; ask the finance office.");
    return { ok: true };
  }
  if (action === "resubmit") {
    if (!own) return no("Only the requester can resubmit.");
    if (card.status !== "changes_requested") return no("This request isn't waiting for changes.");
    return { ok: true };
  }
  if (action === "resolve") {
    if (!has("finance")) return no("Only the finance office records refunds and repayments.");
    if (own) return no("You can't record refunds or repayments on your own request.");
    return { ok: true };
  }

  if (closed || card.status === "changes_requested") return no("This request isn't waiting on an approver.");
  if (own) return no("You can't approve, pay or book your own request.");

  const isApprovalStage = p.stage === "chair" || p.stage === "finance" || p.stage === "executive";
  // Whoever acts at the pay or QuickBooks step can still send it back if something's wrong.
  if (action === "return" && p.stage === "payment") return permission(card, actor, "pay");
  if (action === "return" && p.stage === "books") return permission(card, actor, "books");
  if (action === "approve" || action === "return" || action === "reject") {
    if (!isApprovalStage) return no("This request is past approval.");
    if (p.stage === "chair" && !same(p.approverEmail, actor.email) && !coveringApprover(card, actor) && !approvingAsDirector(card, actor) && !approvingAsCoChair(card, actor))
      return no(`This step is waiting on ${p.approverEmail ?? "the fund's chair"}.`);
    if (p.stage === "finance" && !has("finance")) return no("This step is waiting on the finance office.");
    if (p.stage === "executive" && !has("executive")) return no("This step is waiting on executive approval.");
    return { ok: true };
  }
  if (action === "pay") {
    if (p.stage !== "payment") return no("This request isn't ready to pay.");
    if (!has("finance") && !has("office")) return no("Only the finance office or IAR office records payments.");
    return { ok: true };
  }
  if (action === "books") {
    if (p.stage !== "books") return no("This request isn't ready for QuickBooks.");
    if (!has("finance")) return no("Only the finance office marks QuickBooks entry.");
    return { ok: true };
  }
  return no("Unknown action.");
}

function must(card: PurchaseCard, actor: Actor, action: Action) {
  const r = permission(card, actor, action);
  if (!r.ok) throw new WorkflowError(r.reason);
}

// ---- Transitions ---------------------------------------------------------
// Each returns a new card; the caller saves it.

function entry(actor: Actor, now: string, action: string, note?: string): HistoryEntry {
  return note ? { at: now, by: actor.email, action, note } : { at: now, by: actor.email, action };
}

/** " for chair@…" when someone is covering an away approver. */
function behalf(card: PurchaseCard, actor: Actor): string {
  if (approvingAsCoChair(card, actor)) return " as co-chair";
  if (approvingAsDirector(card, actor)) return " as director";
  const who = coveringApprover(card, actor);
  return who ? ` for ${who}` : "";
}

function withStage(card: PurchaseCard, p: PurchaseDetails, now: string, status?: CardStatus): PurchaseCard {
  const next: PurchaseCard = { ...card, purchase: p, status: status ?? statusForStage(p.stage), updatedAt: now };
  next.waitingOn = waitingOnFor(next);
  next.amount = purchaseTotal(p);
  return next;
}

type ParsedDetails = Extract<ParseResult, { ok: true }>["details"];

/** A new purchase card from checked form input, ready for submit(). The store assigns the ID. */
export function newPurchase(details: ParsedDetails, ownerEmail: string, now: string, attachments: Attachment[] = []): PurchaseCard {
  return {
    id: "",
    orgId: ORG.id,
    type: "purchase",
    title: details.description,
    status: "submitted",
    ownerEmail: ownerEmail.toLowerCase(),
    committee: details.fund,
    createdAt: now,
    updatedAt: now,
    purchase: {
      ...details,
      attestation: { name: details.attestation.name, at: now },
      attachments,
      stage: "chair",
      stageSince: now,
      approvals: [],
      history: [],
      restricted: false,
    },
  };
}

/** Route a freshly built request. `card.purchase.history` should be empty. */
export function submit(card: PurchaseCard, actor: Actor, s: RoutingSettings, now: string): PurchaseCard {
  const route = firstRoute(card.purchase, card.ownerEmail, s);
  const p: PurchaseDetails = {
    ...card.purchase,
    restricted: card.purchase.fund === SOCIAL_WELFARE_FUND,
    stage: route.stage,
    approverEmail: route.approverEmail,
    stageSince: now,
    approvals: [],
    history: [...card.purchase.history, entry(actor, now, "Submitted", route.note)],
  };
  return withStage(card, p, now);
}

export function approve(card: PurchaseCard, actor: Actor, s: RoutingSettings, now: string, opts: { note?: string; w9Received?: boolean } = {}): PurchaseCard {
  must(card, actor, "approve");
  const cur = card.purchase;
  let w9Required = cur.w9Required;
  const history = [...cur.history];
  if (cur.stage === "finance" && cur.w9Required) {
    if (!opts.w9Received) throw new WorkflowError("A W-9 is required for this payee. Confirm it's on file in the restricted W-9 drive before approving.");
    w9Required = false;
    history.push(entry(actor, now, "Confirmed W-9 on file"));
  }
  const asDirector = !approvingAsCoChair(card, actor) && approvingAsDirector(card, actor);
  const onBehalfOf = asDirector || approvingAsCoChair(card, actor) ? undefined : coveringApprover(card, actor);
  const approval = { stage: cur.stage, by: actor.email, at: now, ...(onBehalfOf ? { onBehalfOf } : {}), ...(asDirector ? { asDirector } : {}) };
  const approved: PurchaseDetails = { ...cur, w9Required, approvals: [...cur.approvals, approval] };
  const stage = nextStage(approved, s);
  history.push(entry(actor, now, `Approved (${STAGE_LABEL[cur.stage]})${behalf(card, actor)}`, opts.note));
  const p: PurchaseDetails = { ...approved, stage, approverEmail: undefined, stageSince: now, history, returnNote: undefined };
  return withStage(card, p, now);
}

/** The approval steps in the order a request passes them. */
const STAGE_ORDER: PurchaseStage[] = ["chair", "finance", "executive", "payment", "books", "done"];
const stageIndex = (s: PurchaseStage) => STAGE_ORDER.indexOf(s);

export type ReturnTarget = "requester" | "chair" | "finance" | "executive";

/**
 * Where a request can be sent back to from where it is now: the requester, or
 * any earlier approval step it actually passed (most recent first).
 */
export function returnTargets(card: PurchaseCard): ReturnTarget[] {
  const p = card.purchase;
  const passed = new Set(p.approvals.map((a) => a.stage).filter((st) => stageIndex(st) < stageIndex(p.stage)));
  const earlier = (["executive", "finance", "chair"] as const).filter((st) => passed.has(st));
  return ["requester", ...earlier];
}

export const RETURN_TARGET_LABEL: Record<ReturnTarget, string> = {
  requester: "The requester, to make changes",
  chair: "Chair approval",
  finance: "Finance review",
  executive: "Executive approval",
};

/**
 * Send a request back, with a note saying why. To the requester: they edit and
 * resubmit, and approval starts over. To an earlier step: it waits there again,
 * on the person who approved that step for a chair step, and every approval
 * from that step on is cleared.
 */
export function returnForChanges(card: PurchaseCard, actor: Actor, now: string, note: string, to: ReturnTarget = "requester"): PurchaseCard {
  must(card, actor, "return");
  if (!note.trim()) throw new WorkflowError("Say what needs to change.");
  if (!returnTargets(card).includes(to)) throw new WorkflowError("This request hasn't been through that step, so it can't go back to it.");
  const cur = card.purchase;
  const from = STAGE_LABEL[cur.stage];
  const paid = cur.payment ? `Already paid: ${cur.payment.method} ${cur.payment.reference}. Don't pay it again.` : undefined;
  const history = [...cur.history];
  if (to === "requester") {
    history.push(entry(actor, now, `Returned for changes (${from})${behalf(card, actor)}`, note.trim()));
    if (paid) history.push(entry(actor, now, "Payment already recorded", paid));
    return withStage(card, { ...cur, returnNote: note.trim(), history }, now, "changes_requested");
  }
  const stage: PurchaseStage = to;
  const chairApproval = [...cur.approvals].reverse().find((a) => a.stage === "chair");
  history.push(entry(actor, now, `Sent back to ${STAGE_LABEL[stage]} (from ${from})${behalf(card, actor)}`, note.trim()));
  if (paid) history.push(entry(actor, now, "Payment already recorded", paid));
  const p: PurchaseDetails = {
    ...cur,
    stage,
    stageSince: now,
    approverEmail: stage === "chair" ? chairApproval?.onBehalfOf ?? chairApproval?.by : undefined,
    approvals: cur.approvals.filter((a) => stageIndex(a.stage) < stageIndex(stage)),
    returnNote: note.trim(),
    history,
  };
  return withStage(card, p, now);
}

export function reject(card: PurchaseCard, actor: Actor, now: string, note: string): PurchaseCard {
  must(card, actor, "reject");
  if (!note.trim()) throw new WorkflowError("Give a reason for rejecting it.");
  const p: PurchaseDetails = {
    ...card.purchase,
    returnNote: note.trim(),
    history: [...card.purchase.history, entry(actor, now, `Rejected (${STAGE_LABEL[card.purchase.stage]})${behalf(card, actor)}`, note.trim())],
  };
  return withStage(card, p, now, "denied");
}

/** The requester sends back an edited request; approval starts over. */
export function resubmit(card: PurchaseCard, edited: PurchaseDetails, actor: Actor, s: RoutingSettings, now: string): PurchaseCard {
  must(card, actor, "resubmit");
  const base: PurchaseCard = {
    ...card,
    title: edited.description,
    committee: edited.fund,
    purchase: { ...edited, history: [...card.purchase.history, entry(actor, now, "Edited and resubmitted")] },
  };
  const route = firstRoute(base.purchase, base.ownerEmail, s);
  const p: PurchaseDetails = {
    ...base.purchase,
    restricted: edited.fund === SOCIAL_WELFARE_FUND,
    stage: route.stage,
    approverEmail: route.approverEmail,
    stageSince: now,
    approvals: [],
    returnNote: undefined,
    history: route.note ? [...base.purchase.history, entry(actor, now, "Routed", route.note)] : base.purchase.history,
  };
  return withStage(base, p, now);
}

export function cancel(card: PurchaseCard, actor: Actor, now: string): PurchaseCard {
  must(card, actor, "cancel");
  const p: PurchaseDetails = { ...card.purchase, history: [...card.purchase.history, entry(actor, now, "Cancelled by requester")] };
  return withStage(card, p, now, "cancelled");
}

export function recordPayment(card: PurchaseCard, actor: Actor, now: string, method: string, reference: string): PurchaseCard {
  must(card, actor, "pay");
  if (!method.trim() || !reference.trim()) throw new WorkflowError("Enter the payment method and the check number or ACH reference.");
  const p: PurchaseDetails = {
    ...card.purchase,
    payment: { method: method.trim(), reference: reference.trim(), at: now, by: actor.email },
    stage: "books",
    stageSince: now,
    history: [...card.purchase.history, entry(actor, now, "Paid", `${method.trim()} ${reference.trim()}`)],
  };
  return withStage(card, p, now);
}

export function recordBooks(card: PurchaseCard, actor: Actor, now: string): PurchaseCard {
  must(card, actor, "books");
  const p: PurchaseDetails = {
    ...card.purchase,
    books: { at: now, by: actor.email },
    stage: "done",
    stageSince: now,
    history: [...card.purchase.history, entry(actor, now, "Entered in QuickBooks")],
  };
  return withStage(card, p, now);
}

/** Finance records that a refund or repayment came back. */
export function resolveLine(card: PurchaseCard, actor: Actor, now: string, lineId: string): PurchaseCard {
  must(card, actor, "resolve");
  const line = card.purchase.lines.find((l) => l.id === lineId);
  if (!line || !line.flag) throw new WorkflowError("That line has no refund or repayment to record.");
  if (line.resolvedAt) throw new WorkflowError("Already recorded.");
  const lines = card.purchase.lines.map((l) => (l.id === lineId ? { ...l, resolvedAt: now, resolvedBy: actor.email } : l));
  const what = line.flag === "refund" ? "Refund received" : `Repayment received${line.repayBy ? ` from ${line.repayBy}` : ""}`;
  const p: PurchaseDetails = {
    ...card.purchase,
    lines,
    history: [...card.purchase.history, entry(actor, now, what, `$${line.amount.toFixed(2)}${line.merchant ? ` · ${line.merchant}` : ""}`)],
  };
  return withStage(card, p, now, card.status);
}

/** Days the request has sat at its current stage. */
export function daysWaiting(card: PurchaseCard, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(card.purchase.stageSince)) / 864e5));
}

/** Overdue thresholds from the plan: a reminder at 3 days, escalation at 5. */
export const REMINDER_DAYS = 3;
export const ESCALATE_DAYS = 5;

/** Requests a person can act on right now (their approval queue). */
export function actionableBy(cards: PurchaseCard[], actor: Actor): PurchaseCard[] {
  const acts: Action[] = ["approve", "pay", "books"];
  return cards.filter((c) => acts.some((a) => permission(c, actor, a).ok));
}
