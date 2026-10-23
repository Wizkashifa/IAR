/**
 * Who hears about a purchase request when it moves, and whether they get an alert.
 *
 * The plan's rule: alert only the person who has to act next. Approvers get
 * a Google Chat message the moment a request reaches them; the requester gets
 * one when it comes back for changes. Everything else (approved, paid,
 * rejected) is an in-portal notice only. A committee's director hears in the portal when one
 * of its requests reaches the chair step. Plain functions so they can be tested.
 */
import { commenters, preview } from "../comments";
import type { Role } from "../org";
import { STAGE_LABEL, purchaseTotal } from "./types";
import type { Actor, PurchaseCard } from "./workflow";

/** One person, or everyone in a role's Google Group. */
export type Recipient = { email: string } | { role: Role };

/** Used for every portal notice, not only purchases (see lib/notifications.ts). */
export type Notice = {
  to: Recipient;
  cardId?: string;
  href: string;
  text: string;
  /** Also send an alert in Google Chat (only when the recipient has to act). See lib/alerts.ts. */
  alert: boolean;
  /** Pass to whoever covers for the recipient while they're away. */
  delegable: boolean;
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** Social & Welfare details stay out of notices, which outlive the request's own access checks. */
function label(c: PurchaseCard): string {
  return c.purchase.restricted ? `${c.id} (Social & Welfare request)` : `${c.id} “${c.title}” (${money(purchaseTotal(c.purchase))})`;
}

/** Who acts at the card's current stage. */
function nextActor(c: PurchaseCard): Recipient | null {
  switch (c.purchase.stage) {
    case "chair":
      return c.purchase.approverEmail ? { email: c.purchase.approverEmail } : null;
    case "finance":
    case "payment":
    case "books":
      return { role: "finance" };
    case "executive":
      return { role: "executive" };
    case "done":
      return null;
  }
}

const STAGE_ORDER = ["chair", "finance", "executive", "payment", "books", "done"];

const isOpen = (c: PurchaseCard) => c.status === "in_review" || c.status === "approved" || c.status === "paid";

/**
 * Notices for one change, from the card before (null for a new request) to
 * after. The actor never notifies themselves.
 */
export function purchaseNotices(before: PurchaseCard | null, after: PurchaseCard, actor: Actor, opts: { directors?: string[]; chairs?: string[] } = {}): Notice[] {
  const out: Notice[] = [];
  const href = `/purchases/${after.id}`;
  const what = label(after);
  const add = (to: Recipient, text: string, alert: boolean, delegable = false) => {
    if ("email" in to && same(to.email, actor.email)) return;
    out.push({ to, cardId: after.id, href, text, alert, delegable });
  };
  const owner = { email: after.ownerEmail };

  if (after.status === "changes_requested" && before?.status !== "changes_requested") {
    add(owner, `${what} was returned for changes: ${after.purchase.returnNote ?? "see the request"}`, true);
    return out;
  }
  if (after.status === "denied" && before?.status !== "denied") {
    add(owner, `${what} was rejected: ${after.purchase.returnNote ?? "see the request"}`, false);
    return out;
  }
  if (after.status === "cancelled" && before && before.status !== "cancelled") {
    const was = nextActor(before);
    if (was && isOpen(before)) add(was, `${what} was cancelled by the requester. Nothing more to do.`, false);
    return out;
  }

  const moved = !before || before.status === "changes_requested" || before.purchase.stage !== after.purchase.stage;
  if (!moved || !isOpen(after)) return out;

  const next = nextActor(after);
  const stage = after.purchase.stage;
  // Sent back to an earlier step: that step's approver acts again, and the requester hears why.
  if (before && isOpen(before) && STAGE_ORDER.indexOf(stage) < STAGE_ORDER.indexOf(before.purchase.stage)) {
    const why = after.purchase.returnNote ?? "see the request";
    if (next) add(next, `${what} was sent back for your ${STAGE_LABEL[stage].toLowerCase()} again: ${why}`, true, "email" in next);
    add(owner, `${what} was sent back to ${STAGE_LABEL[stage].toLowerCase()}: ${why}`, false);
    return out;
  }
  if (next) {
    const ask =
      stage === "payment" ? `${what} is approved and ready to pay.` :
      stage === "books" ? `${what} is paid and ready to enter in QuickBooks.` :
      `${what} needs your ${STAGE_LABEL[stage].toLowerCase()}.`;
    // QuickBooks entry is batch work finance does from its queue; no alert for it.
    add(next, ask, stage !== "books", "email" in next);
  }
  // Co-chairs and directors can take the chair step too: a notice in the portal, no alert (the named chair gets one).
  if (stage === "chair") {
    for (const c of opts.chairs ?? []) {
      if (!same(c, after.purchase.approverEmail) && !same(c, after.ownerEmail))
        add({ email: c }, `${what} is waiting for chair approval. As one of the committee's chairs you can approve it too.`, false);
    }
  }
  if (stage === "chair" && !after.purchase.restricted) {
    for (const d of opts.directors ?? []) {
      if (!same(d, after.purchase.approverEmail) && !same(d, after.ownerEmail))
        add({ email: d }, `${what} is waiting for chair approval. As the committee's director you can approve it too.`, false);
    }
  }
  if (before) {
    if (stage === "payment") add(owner, `${what} is approved. The finance office will pay it.`, false);
    else if (stage === "books" && after.purchase.payment)
      add(owner, `${what} was paid (${after.purchase.payment.method} ${after.purchase.payment.reference}).`, false);
  }
  return out;
}

/**
 * A new comment: the requester, whoever the request is waiting on, and
 * earlier commenters hear about it in the portal. No alert: a comment asks
 * nothing of anyone by itself.
 */
export function purchaseCommentNotices(card: PurchaseCard, by: Actor, text: string): Notice[] {
  const href = `/purchases/${card.id}#comments`;
  const what = label(card);
  const msg = card.purchase.restricted ? `${by.name} commented on ${what}` : `${by.name} commented on ${what}: “${preview(text)}”`;
  const open = card.status === "in_review" || card.status === "approved" || card.status === "paid";
  const to: Recipient[] = [{ email: card.ownerEmail }, ...commenters(card).map((email) => ({ email }))];
  const next = open ? nextActor(card) : null;
  if (next) to.push(next);
  const seen = new Set<string>();
  const out: Notice[] = [];
  for (const r of to) {
    const key = "email" in r ? r.email.toLowerCase() : `role:${r.role}`;
    if (seen.has(key) || ("email" in r && same(r.email, by.email))) continue;
    seen.add(key);
    out.push({ to: r, cardId: card.id, href, text: msg, alert: false, delegable: false });
  }
  return out;
}
