import "server-only";
import { cardStore, ConflictError, type Card } from "../cards";
import type { Notice } from "../notices";
import { autoPiece, piecesAfterEventChange } from "../marketing/linked";
import { marketingNotices } from "../marketing/notices";
import { piecesFor } from "../marketing/pieces";
import type { Actor, MarketingCard } from "../marketing/workflow";
import { avTicketsAfterEventChange, type RoomName } from "../tickets/event-av";
import { type TicketCard, isTicketCard } from "../tickets/workflow";
import { eventContext } from "./context";
import { roomById } from "./rooms";
import type { EventCard } from "./workflow";

/** An event's A/V tickets. */
export async function ticketsFor(eventId: string): Promise<TicketCard[]> {
  return (await (await cardStore()).listTicketsForEvent(eventId)).filter(isTicketCard);
}

/** Rooms by name, for the tickets (the event keeps room IDs). */
export async function roomNames(): Promise<RoomName> {
  const { rooms } = await eventContext();
  return (id) => roomById(rooms, id)?.name ?? id;
}

/**
 * After an event was saved, the cards linked to it follow it: its marketing
 * pieces (lib/marketing/linked.ts) and its A/V tickets (lib/tickets/event-av.ts).
 * Each card is saved only if nobody saved it meanwhile (one more try on a
 * fresh copy), and its notice goes out only once it's saved. Returns the
 * notices to deliver. A card that can't be saved is logged and never undoes
 * the event's own change, nor stops the others.
 */
export async function syncLinked(before: EventCard | null, after: EventCard, actor: Actor): Promise<Notice[]> {
  const [pieces, tickets] = await Promise.all([syncPieces(before, after, actor), syncAvTickets(before, after)]);
  return [...pieces, ...tickets];
}

/** Notices about cards that weren't changed go out as they are; the others once their card is saved. */
function noticesFor(all: Notice[], changedIds: Set<string>, savedIds: Set<string>): Notice[] {
  return all.filter((n) => !n.cardId || !changedIds.has(n.cardId) || savedIds.has(n.cardId));
}

/** Saves each changed card (redoing it on the latest copy after a conflict); the IDs that were saved. */
async function saveAll<C extends Card>(changed: C[], had: C[], redo: (latest: Card) => C | undefined, what: string): Promise<Set<string>> {
  const store = await cardStore();
  const saved = new Set<string>();
  for (const next of changed) {
    try {
      const was = had.find((c) => c.id === next.id)!;
      try {
        await store.save(next, was.updatedAt);
        saved.add(next.id);
      } catch (err) {
        if (!(err instanceof ConflictError)) throw err;
        const latest = await store.get(next.id);
        const again = latest ? redo(latest) : undefined;
        if (!again) continue;
        await store.save(again, latest!.updatedAt);
        saved.add(next.id);
      }
    } catch (err) {
      console.error(`saving ${what} ${next.id} failed`, err);
    }
  }
  return saved;
}

/** The event's marketing pieces, and the "Flyer and announcement" piece when a public event is approved. */
async function syncPieces(before: EventCard | null, after: EventCard, actor: Actor): Promise<Notice[]> {
  const now = new Date().toISOString();
  let pieces: MarketingCard[];
  try {
    pieces = await piecesFor(after.id);
  } catch (err) {
    console.error("loading an event's marketing pieces failed", err);
    return [];
  }
  const changed = piecesAfterEventChange(before, after, pieces, now);
  const saved = await saveAll(changed.pieces, pieces, (latest) => piecesAfterEventChange(before, after, [latest as MarketingCard], now).pieces[0], "marketing piece");
  const notices = noticesFor(changed.notices, new Set(changed.pieces.map((p) => p.id)), saved);
  try {
    const auto = autoPiece(before, after, pieces, now);
    if (auto) {
      const { id: _blank, ...toCreate } = auto;
      const created = (await (await cardStore()).create(toCreate, "MK")) as MarketingCard;
      // The team hears about it like any new request.
      notices.push(...marketingNotices(null, created, actor));
    }
  } catch (err) {
    console.error(`adding the flyer and announcement for ${after.id} failed`, err);
  }
  return notices;
}

/** The event's A/V tickets: one per date once it's approved, cancelled or brought up to date as it changes. */
async function syncAvTickets(before: EventCard | null, after: EventCard): Promise<Notice[]> {
  const now = new Date().toISOString();
  let tickets: TicketCard[];
  let names: RoomName;
  try {
    [tickets, names] = await Promise.all([ticketsFor(after.id), roomNames()]);
  } catch (err) {
    console.error("loading an event's A/V tickets failed", err);
    return [];
  }
  const changed = avTicketsAfterEventChange(before, after, tickets, names, now);
  const saved = await saveAll(changed.update, tickets, (latest) => (isTicketCard(latest) ? avTicketsAfterEventChange(before, after, [latest], names, now).update.find((t) => t.id === latest.id) : undefined), "A/V ticket");
  const notices = noticesFor(changed.notices, new Set(changed.update.map((t) => t.id)), saved);
  // New tickets: the team's one alert about them goes out once at least one is made.
  let made = 0;
  for (const t of changed.create) {
    try {
      const { id: _blank, ...toCreate } = t;
      await (await cardStore()).create(toCreate, "TK");
      made++;
    } catch (err) {
      console.error(`adding an A/V ticket for ${after.id} failed`, err);
    }
  }
  return made ? notices : notices.filter((n) => n.cardId !== after.id);
}
