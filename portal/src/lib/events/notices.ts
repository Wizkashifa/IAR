/**
 * Who hears about an event request when it moves, and who gets an alert.
 * Same rule as purchases: an alert only for whoever has to act next (the
 * director, the executive, the requester on a send-back). Plain functions.
 */
import { type Notice, type Recipient, commentNotices } from "../notices";
import { dayText, timeText } from "./series";
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
    for (const d of reviewers) add({ email: d }, `${what} needs your director review.${why ? ` ${why}` : ""}`, true, true);
  }
  if (stage === "mission" && after.status === "in_review") add({ role: "executive" }, `${what} needs executive review.`, true);
  if (stage === "approved" && after.status === "approved" && before) {
    add(owner, `${what} is approved.${after.event.rooms.length ? " The room is confirmed on the IAR calendar." : ""}`, false);
  }
  return out;
}

/** A new comment: the requester, whoever it's waiting on, and earlier commenters, in the portal only. */
export function eventCommentNotices(card: EventCard, by: EventActor, text: string, directors: string[]): Notice[] {
  const also: Recipient[] = [];
  if (card.status === "in_review" && card.event.stage === "director") also.push(...reviewersFor(card.ownerEmail, directors).map((email) => ({ email })));
  if (card.status === "in_review" && card.event.stage === "mission") also.push({ role: "executive" });
  return commentNotices(card, by, text, { href: `/events/${card.id}`, what: `${card.id} “${card.title}”`, also });
}

/**
 * A date or time change, made by the requester or approved or declined: the
 * approvers who already acted hear about it, whoever approves a change gets
 * an alert, and the requester hears the answer.
 */
export function rescheduleNotices(before: EventCard, after: EventCard, actor: EventActor, directors: string[]): Notice[] {
  const out: Notice[] = [];
  const href = `/events/${after.id}`;
  const what = label(after);
  const told = new Set<string>();
  const add = (to: Recipient, text: string, alert: boolean, delegable = false) => {
    const key = "email" in to ? to.email.toLowerCase() : `role:${to.role}`;
    if (("email" in to && same(to.email, actor.email)) || told.has(key)) return;
    told.add(key);
    out.push({ to, cardId: after.id, href, text, alert, delegable });
  };
  const b = before.event, a = after.event;
  const owner = { email: after.ownerEmail };
  const approvers = reviewersFor(after.ownerEmail, directors);
  const changeTo: Recipient[] = approvers.length ? approvers.map((email) => ({ email })) : [{ role: "executive" }];
  const acted = [...new Set(b.approvals.map((x) => x.by))];
  const newTime = (t: { date: string; start: string; end: string }) => `${dayText(t.date)}, ${timeText(t.start)}–${timeText(t.end)}`;

  if (!b.change && a.change) {
    for (const to of changeTo) add(to, `${what}: the requester asks to move it to ${newTime(a.change)}. Please approve or decline the new time. The approved time stays booked until then.`, true, true);
    for (const by of acted) add({ email: by }, `${what}, which you approved: the requester asks to move it to ${newTime(a.change)}.`, false);
    return out;
  }
  if (b.change && !a.change) {
    const moved = b.date !== a.date || b.start !== a.start || b.end !== a.end || b.setup !== a.setup || b.teardown !== a.teardown;
    if (same(actor.email, after.ownerEmail)) {
      for (const to of changeTo) add(to, `${what}: the requester withdrew the new time. Nothing to do.`, false);
    } else {
      add(owner, moved ? `${what}: the new time is approved, ${newTime(a)}.${a.rooms.length ? " The room is moved on the IAR calendar." : ""}` : `${what}: the new time wasn't approved, so the approved time stays. See the request for why.`, !moved);
      if (moved) for (const by of acted) add({ email: by }, `${what}, which you approved, moved to ${newTime(a)}.`, false);
    }
    return out;
  }
  // Before approval: anyone who already approved, and whoever is reviewing it now, hear about the new time.
  for (const by of acted) add({ email: by }, `${what}, which you approved, was moved by the requester to ${newTime(a)}.`, false);
  if (after.status === "in_review" && b.stage === a.stage) {
    if (a.stage === "director") for (const d of approvers) add({ email: d }, `${what}, waiting on your review, was moved by the requester to ${newTime(a)}.`, false);
    if (a.stage === "mission") add({ role: "executive" }, `${what}, waiting on executive review, was moved by the requester to ${newTime(a)}.`, false);
  }
  return out;
}
