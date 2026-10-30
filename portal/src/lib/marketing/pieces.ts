import "server-only";
import { cardStore, ConflictError } from "../cards";
import type { Notice } from "../notices";
import type { EventCard } from "../events/workflow";
import { autoPiece, piecesAfterEventChange } from "./linked";
import { marketingNotices } from "./notices";
import { isMarketingCard, type Actor, type MarketingCard } from "./workflow";

/** The marketing pieces linked to an event. */
export async function piecesFor(eventId: string): Promise<MarketingCard[]> {
  return (await (await cardStore()).listMarketingForEvent(eventId)).filter(isMarketingCard);
}

/**
 * After an event was saved: its marketing pieces follow it (lib/marketing/linked.ts).
 * Cancels open pieces of a cancelled or declined event, tells whoever has a
 * piece when the event changes, and adds the "Flyer and announcement" piece
 * when a public event is approved. Each piece is saved only if nobody saved
 * it meanwhile (one more try on a fresh copy), and its notice goes out only
 * once it's saved. Returns the notices to deliver. A piece that can't be
 * saved is logged and never undoes the event's own change, nor stops the
 * other pieces.
 */
export async function syncPieces(before: EventCard | null, after: EventCard, actor: Actor): Promise<Notice[]> {
  const notices: Notice[] = [];
  const store = await cardStore();
  const now = new Date().toISOString();
  let pieces: MarketingCard[] = [];
  try {
    pieces = await piecesFor(after.id);
  } catch (err) {
    console.error("loading an event's marketing pieces failed", err);
    return notices;
  }

  const changed = piecesAfterEventChange(before, after, pieces, now);
  const changedIds = new Set(changed.pieces.map((p) => p.id));
  // Pieces that only get a notice (the event changed) have nothing to save.
  notices.push(...changed.notices.filter((n) => !n.cardId || !changedIds.has(n.cardId)));
  for (const next of changed.pieces) {
    try {
      const saved = await saveFollowing(next, pieces.find((p) => p.id === next.id)!, (latest) => piecesAfterEventChange(before, after, [latest], now).pieces[0]);
      if (saved) notices.push(...changed.notices.filter((n) => n.cardId === next.id));
    } catch (err) {
      console.error(`saving marketing piece ${next.id} after ${after.id} changed failed`, err);
    }
  }

  try {
    const auto = autoPiece(before, after, pieces, now);
    if (auto) {
      const { id: _blank, ...toCreate } = auto;
      const created = (await store.create(toCreate, "MK")) as MarketingCard;
      // The team hears about it like any new request.
      notices.push(...marketingNotices(null, created, actor));
    }
  } catch (err) {
    console.error(`adding the flyer and announcement for ${after.id} failed`, err);
  }
  return notices;
}

/** Saves `next`; if someone saved the piece meanwhile, works it out again on the latest copy. False when there's nothing left to change. */
async function saveFollowing(next: MarketingCard, was: MarketingCard, redo: (latest: MarketingCard) => MarketingCard | undefined): Promise<boolean> {
  const store = await cardStore();
  try {
    await store.save(next, was.updatedAt);
    return true;
  } catch (err) {
    if (!(err instanceof ConflictError)) throw err;
    const latest = await store.get(next.id);
    const again = isMarketingCard(latest) ? redo(latest) : undefined;
    if (!again) return false;
    await store.save(again, latest!.updatedAt);
    return true;
  }
}
