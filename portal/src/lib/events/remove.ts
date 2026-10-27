import "server-only";
import { cardStore } from "../cards";
import type { Notice } from "../notices";
import { lc } from "../text";
import { eventContext } from "./context";
import { syncHolds } from "./holds";
import { holdKeyOf, isOpenAsk } from "./slot-requests";
import { slotRequestStore } from "./slot-requests-store";
import * as wf from "./workflow";

/**
 * Before a portal admin deletes an event request: take its holds off the room
 * calendars, withdraw any ask for a booked time it made, and let any request
 * that asked for its time go on to review (the time is free now). Returns
 * notices for the people whose requests moved, and problems to report.
 */
export async function beforeDeletingEvent(card: wf.EventCard, by: string): Promise<{ notices: Notice[]; problems: string[] }> {
  const ctx = await eventContext();
  const slots = await slotRequestStore();
  const store = await cardStore();
  const now = new Date().toISOString();
  const notices: Notice[] = [];
  const problems: string[] = [];
  const note = { at: now, by: lc(by), text: `${card.id} was deleted by a portal admin` };

  for (const h of card.event.holds) {
    try {
      await ctx.calendar.deleteHold(h.calendarId, h.eventId);
    } catch (err) {
      console.error("deleting a calendar hold failed", err);
      problems.push(`The hold on ${ctx.rooms.find((r) => r.id === h.roomId)?.name ?? h.roomId} couldn't be taken off the calendar. Remove it in Google Calendar.`);
    }
  }

  // Its own asks for someone else's time.
  for (const r of await slots.listFromCard(card.id)) {
    if (isOpenAsk(r)) await slots.save({ ...r, status: "withdrawn", updatedAt: now, history: [...r.history, note] }, r.updatedAt);
  }

  // Asks for its time: the time is free now, so those requests go on to review.
  for (const r of await slots.listForHold(holdKeyOf({ cardId: card.id }))) {
    if (!isOpenAsk(r)) continue;
    await slots.save({ ...r, status: "released", updatedAt: now, history: [...r.history, note] }, r.updatedAt);
    const asker = await store.get(r.fromCard);
    if (!wf.isEventCard(asker) || asker.event.waitingOnAsk !== r.id) continue;
    const synced = await syncHolds(wf.slotGranted(asker, ctx.directorsOf(asker.event.committeeGroup), now, r.id), ctx);
    await store.save(synced.card, asker.updatedAt);
    notices.push({ to: { email: asker.ownerEmail }, cardId: asker.id, href: `/events/${asker.id}`, text: `${asker.id} “${asker.title}”: the booking you asked about was removed, so the time is yours. Your request goes on to review.`, alert: true, delegable: false });
  }
  return { notices, problems };
}
