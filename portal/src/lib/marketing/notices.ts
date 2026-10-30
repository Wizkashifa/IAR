/**
 * Who hears about a marketing request when it moves, and whether they get an alert.
 *
 * Alert only whoever has to act next: the marketing team (a post in its
 * Google Chat space) for a new request or an answer to its question; the
 * requester when marketing asks a question, sends a draft to approve, or
 * declines; whoever has the work (the team if nobody does) when the
 * requester approves the draft or asks for changes; a team member when work
 * is handed to them. Scheduled and marketed are in-portal notices only.
 * Plain functions so they can be tested.
 */
import { preview } from "../comments";
import { fmtDayTime } from "../format";
import { type Notice, type Recipient, commentNotices } from "../notices";
import { approvalDue, channelText, holderOf, isWorkStage, longDay, teamContact, type Actor, type MarketingCard } from "./workflow";
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
  // Whoever has the work, or the whole team if nobody does.
  const assignee = teamContact(after);

  if (!before) {
    add(TEAM, `New marketing request: ${what}.`, true);
    return out;
  }
  // Handed to someone on the team: it's theirs to do now.
  if (m.assignee && !same(m.assignee, before.marketing.assignee) && isWorkStage(m.stage))
    add({ email: m.assignee }, `${what} is yours: ${actor.name || actor.email} handed it to you.${m.doneBy ? ` Marketing aims to finish by ${longDay(m.doneBy)}.` : ""}`, true);
  if (was === m.stage) {
    // Same stage: only a new done-by date is worth telling the requester.
    if (isWorkStage(m.stage) && m.doneBy && m.doneBy !== before.marketing.doneBy)
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
    case "proof": {
      const due = approvalDue(m);
      add(owner, `${what}: marketing sent a draft for your approval. Approve it or ask for changes${due ? ` by ${fmtDayTime(due)}` : ""}.`, true);
      break;
    }
    case "ready":
      add(assignee, `${what}: ${m.requesterName} approved the draft. It's ready to go out.`, true);
      break;
    case "done": {
      const where = channelText(m.channels);
      add(owner, `${what} ${where ? `went out on ${where}.` : "is done."}${m.doneNote ? ` ${preview(m.doneNote)}` : ""}`, false);
      break;
    }
    case "declined":
      add(owner, `${what} was declined: ${preview(m.declineReason ?? "see the request")}`, true);
      break;
    case "cancelled":
      if (was === "review") add(TEAM, `${what} was cancelled by the requester. Nothing more to do.`, false);
      break;
    case "doing":
      if (was === "proof") add(assignee, `${what}: ${m.requesterName} asked for changes: ${preview(m.changesAsked ?? "see the request")}`, true);
      break;
  }
  return out;
}

/**
 * A new comment: the requester, whoever the request is with, and earlier
 * commenters hear about it in the portal. No alert: a comment asks nothing
 * of anyone by itself.
 */
export function marketingCommentNotices(card: MarketingCard, by: Actor, text: string): Notice[] {
  const next = holderOf(card);
  return commentNotices(card, by, text, { href: `/marketing/${card.id}`, what: label(card), also: next ? [next] : [] });
}
