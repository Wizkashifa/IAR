import "server-only";
import { cardStore } from "../cards";
import type { Notice } from "../notices";
import { lc } from "../text";
import { historyEntry } from "../workflow-core";
import { eventContext } from "./context";
import { syncHolds } from "./holds";
import { holdKeyOf, isOpenAsk } from "./slot-requests";
import { slotRequestStore } from "./slot-requests-store";
import * as wf from "./workflow";
import { piecesOnEventDeleted } from "../marketing/linked";
import { piecesFor } from "../marketing/pieces";
import { avTicketsOnEventDeleted } from "../tickets/event-av";
import { ticketsFor } from "./linked-sync";

/**
 * Before a portal admin deletes an event request: take its holds off the room
 * calendars, withdraw any ask for a booked time it made, let any request that
 * asked for its time go on to review (the time is free now), unlink the
 * payment requests linked to it, and cancel and unlink its open marketing
 * pieces and A/V tickets. Returns notices for the people whose requests
 * moved, and problems to report.
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

  // Its own asks for someone else's time. One that fails is reported; the rest still go ahead.
  for (const r of await slots.listFromCard(card.id)) {
    if (!isOpenAsk(r)) continue;
    try {
      await slots.save({ ...r, status: "withdrawn", updatedAt: now, history: [...r.history, note] }, r.updatedAt);
    } catch (err) {
      console.error("withdrawing an ask failed", err);
      problems.push(`Its ask ${r.id} couldn't be withdrawn. Check it on the Events page.`);
    }
  }

  // Asks for its time: the time is free now, so those requests go on to review.
  for (const r of await slots.listForHold(holdKeyOf({ cardId: card.id }))) {
    if (!isOpenAsk(r)) continue;
    try {
      const asker = await store.get(r.fromCard);
      if (wf.isEventCard(asker) && asker.event.waitingOnAsk === r.id) {
        const synced = await syncHolds(wf.slotGranted(asker, ctx.directorsOf(asker.event.committeeGroup), now, r.id), ctx);
        await store.save(synced.card, asker.updatedAt);
        notices.push({ to: { email: asker.ownerEmail }, cardId: asker.id, href: `/events/${asker.id}`, text: `${asker.id} “${asker.title}”: the booking you asked about was removed, so the time is yours. Your request goes on to review.`, alert: true, delegable: false });
      }
      await slots.save({ ...r, status: "released", updatedAt: now, history: [...r.history, note] }, r.updatedAt);
    } catch (err) {
      console.error("releasing an ask failed", err);
      problems.push(`${r.fromCard} asked for this event's time (${r.id}) and couldn't be moved on to review. Open ${r.fromCard} and check it.`);
    }
  }
  // Payment requests linked to it: unlinked, so they don't point at a request that's gone.
  for (const p of await store.listPurchasesForEvent(card.id)) {
    if (!p.purchase) continue;
    try {
      await store.save({ ...p, purchase: { ...p.purchase, eventCardId: undefined, history: [...p.purchase.history, historyEntry(by, now, `Unlinked from ${card.id}, which a portal admin deleted`)] }, updatedAt: now }, p.updatedAt);
    } catch (err) {
      console.error("unlinking a payment request failed", err);
      problems.push(`${p.id} is still linked to this event. Edit it to pick another event.`);
    }
  }
  // Marketing pieces for it: open ones are cancelled, and none points at a request that's gone.
  const pieces = await piecesFor(card.id);
  const gone = piecesOnEventDeleted(card, pieces, now);
  for (const next of gone.pieces) {
    try {
      await store.save(next, pieces.find((p) => p.id === next.id)!.updatedAt);
      notices.push(...gone.notices.filter((n) => n.cardId === next.id));
    } catch (err) {
      console.error("unlinking a marketing piece failed", err);
      problems.push(`${next.id} is still linked to this event. Open it and cancel it if it's no longer needed.`);
    }
  }
  // A/V tickets for it: open ones are cancelled, and none points at a request that's gone.
  const tickets = await ticketsFor(card.id);
  const avGone = avTicketsOnEventDeleted(card, tickets, now);
  for (const next of avGone.update) {
    try {
      await store.save(next, tickets.find((t) => t.id === next.id)!.updatedAt);
      notices.push(...avGone.notices.filter((n) => n.cardId === next.id));
    } catch (err) {
      console.error("unlinking an A/V ticket failed", err);
      problems.push(`${next.id} is still linked to this event. Ask IT Services to close it if it's no longer needed.`);
    }
  }
  return { notices, problems };
}
