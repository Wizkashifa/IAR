/**
 * Who hears about an event request when it moves, and who gets an alert.
 * Same rule as purchases: an alert only for whoever has to act next (the
 * director, the executive, the requester on a send-back). Plain functions.
 */
import { commenters, preview } from "../comments";
import type { Notice, Recipient } from "../purchases/notices";
import { dayText } from "./series";
import { type EventActor, type EventCard, reviewersFor } from "./workflow";
import { same } from "../text";

const label = (c: EventCard) => `${c.id} “${c.title}” (${c.event.dates[0] ? dayText(c.event.dates[0]) : "no date"}${c.event.dates.length > 1 ? `, ${c.event.dates.length} dates` : ""})`;

/** Notices for one change, from the card before (null for a new request) to after. The actor never notifies themselves. */
export function eventNotices(before: EventCard | null, after: EventCard, actor: EventActor, directors: string[]): Notice[] {
  const out: Notice[] = [];
  const href = `/events/${after.id}`;
  const what = label(after);
  const add = (to: Recipient, text: string, alert: boolean, delegable = false) => {
    if ("email" in to && same(to.email, actor.email)) return;
    out.push({ to, cardId: after.id, href, text, alert, delegable });
  };
  const owner = { email: after.ownerEmail };
  const reviewers = reviewersFor(after.ownerEmail, directors);

  if (after.status === "changes_requested" && before?.status !== "changes_requested") {
    if (after.event.releasedFor) add(owner, `${what}: you gave up its time. Pick a new time; only the director needs to approve it.`, true);
    else add(owner, `${what} was sent back for changes: ${after.event.returnNote ?? "see the request"}`, true);
    return out;
  }
  if (after.status === "denied" && before?.status !== "denied") {
    add(owner, `${what} was denied: ${after.event.returnNote ?? "see the request"}`, false);
    return out;
  }
  if (after.status === "cancelled" && before && before.status !== "cancelled") {
    if (before.event.stage === "director") for (const d of reviewersFor(before.ownerEmail, directors)) add({ email: d }, `${what} was cancelled by the requester. Nothing more to do.`, false);
    if (before.event.stage === "mission" && before.status === "in_review") add({ role: "executive" }, `${what} was cancelled by the requester. Nothing more to do.`, false);
    return out;
  }

  const moved = !before || before.status === "changes_requested" || before.event.stage !== after.event.stage;
  if (!moved) return out;
  const stage = after.event.stage;
  if (stage === "director" && after.status === "in_review") {
    const why = after.event.releasedFor ? "It was moved to give up its time, so only you need to approve it." : "";
    for (const d of reviewers) add({ email: d }, `${what} needs your mission review as the committee's director.${why ? ` ${why}` : ""}`, true, true);
  }
  if (stage === "mission" && after.status === "in_review") add({ role: "executive" }, `${what} needs executive review.`, true);
  if (stage === "approved" && after.status === "approved" && before) {
    add(owner, `${what} is approved.${after.event.rooms.length ? " The room is confirmed on the IAR calendar." : ""}`, false);
  }
  return out;
}

/** A new comment: the requester, whoever it's waiting on, and earlier commenters, in the portal only. */
export function eventCommentNotices(card: EventCard, by: EventActor, text: string, directors: string[]): Notice[] {
  const href = `/events/${card.id}#comments`;
  const msg = `${by.name} commented on ${card.id} “${card.title}”: “${preview(text)}”`;
  const to: Recipient[] = [{ email: card.ownerEmail }, ...commenters(card).map((email) => ({ email }))];
  if (card.status === "in_review" && card.event.stage === "director") to.push(...reviewersFor(card.ownerEmail, directors).map((email) => ({ email })));
  if (card.status === "in_review" && card.event.stage === "mission") to.push({ role: "executive" });
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
