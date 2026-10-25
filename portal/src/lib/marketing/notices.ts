/**
 * Who hears about a marketing request when it moves, and whether they get an alert.
 *
 * Alert only whoever has to act next: the marketing team (a post in its
 * Google Chat space) for a new request or an answer to its question; the
 * requester when marketing asks a question or declines. Scheduled and done
 * are in-portal notices only. Plain functions so they can be tested.
 */
import { preview } from "../comments";
import { type Notice, type Recipient, commentNotices } from "../notices";
import { longDay, type Actor, type MarketingCard } from "./workflow";
import { same } from "../text";

const TEAM: Recipient = { role: "marketing" };

const label = (c: MarketingCard) => `${c.id} “${c.title}”`;

/**
 * Notices for one change, from the card before (null for a new request) to
 * after. The actor never notifies themselves.
 */
export function marketingNotices(before: MarketingCard | null, after: MarketingCard, actor: Actor): Notice[] {
  const out: Notice[] = [];
  const href = `/marketing/${after.id}`;
  const what = label(after);
  const add = (to: Recipient, text: string, alert: boolean) => {
    if ("email" in to && same(to.email, actor.email)) return;
    out.push({ to, cardId: after.id, href, text, alert, delegable: false });
  };
  const owner = { email: after.ownerEmail };
  const m = after.marketing;
  const was = before?.marketing.stage;

  if (!before) {
    add(TEAM, `${what} is new for the weekly review.`, true);
    return out;
  }
  if (was === m.stage) {
    // Same stage: only a new done-by date is worth telling the requester.
    if ((m.stage === "scheduled" || m.stage === "doing") && m.doneBy && m.doneBy !== before.marketing.doneBy)
      add(owner, `${what}: marketing now aims to finish by ${longDay(m.doneBy)}.`, false);
    return out;
  }
  switch (m.stage) {
    case "review":
      if (was === "question") add(TEAM, `${what}: ${m.requesterName} answered your question.`, true);
      break;
    case "question":
      add(owner, `${what}: marketing has a question: ${preview(m.question ?? "see the request")}`, true);
      break;
    case "scheduled":
      add(owner, `${what} is scheduled. Marketing aims to finish by ${m.doneBy ? longDay(m.doneBy) : "the date on the request"}.`, false);
      break;
    case "done":
      add(owner, `${what} is done.${m.doneNote ? ` ${preview(m.doneNote)}` : ""}`, false);
      break;
    case "declined":
      add(owner, `${what} was declined: ${preview(m.declineReason ?? "see the request")}`, true);
      break;
    case "cancelled":
      if (was === "review") add(TEAM, `${what} was cancelled by the requester. Nothing more to do.`, false);
      break;
    case "doing":
      break;
  }
  return out;
}

/** Who the request is with right now: the team, the person working on it, or the requester. */
function nextActor(c: MarketingCard): Recipient | null {
  switch (c.marketing.stage) {
    case "review":
    case "scheduled":
      return TEAM;
    case "doing":
      return c.marketing.assignee ? { email: c.marketing.assignee } : TEAM;
    case "question":
      return { email: c.ownerEmail };
    default:
      return null;
  }
}

/**
 * A new comment: the requester, whoever the request is with, and earlier
 * commenters hear about it in the portal. No alert: a comment asks nothing
 * of anyone by itself.
 */
export function marketingCommentNotices(card: MarketingCard, by: Actor, text: string): Notice[] {
  const next = nextActor(card);
  return commentNotices(card, by, text, { href: `/marketing/${card.id}`, what: label(card), also: next ? [next] : [] });
}
