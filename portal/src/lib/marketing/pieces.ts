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
 * it meanwhile (one more try on a fresh copy). Returns the notices to
 * deliver. A piece that can't be saved is logged and never undoes the
 * event's own change.
 */
export async function syncPieces(before: EventCard | null, after: EventCard, actor: Actor): Promise<Notice[]> {
  const notices: Notice[] = [];
  try {
    const store = await cardStore();
    const pieces = await piecesFor(after.id);
    const now = new Date().toISOString();
    const changed = piecesAfterEventChange(before, after, pieces, now);
    for (const next of changed.pieces) {
      const was = pieces.find((p) => p.id === next.id)!;
      try {
        await store.save(next, was.updatedAt);
      } catch (err) {
        if (!(err instanceof ConflictError)) throw err;
        // Someone saved the piece meanwhile: work it out again on the latest copy.
        const latest = await store.get(next.id);
        if (!isMarketingCard(latest)) continue;
        const again = piecesAfterEventChange(before, after, [latest], now).pieces[0];
        if (again) await store.save(again, latest.updatedAt);
      }
    }
    notices.push(...changed.notices);

    const auto = autoPiece(before, after, pieces, now);
    if (auto) {
      const { id: _blank, ...toCreate } = auto;
      const created = (await store.create(toCreate, "MK")) as MarketingCard;
      // The team hears about it like any new request.
      notices.push(...marketingNotices(null, created, actor));
    }
  } catch (err) {
    console.error("syncing an event's marketing pieces failed", err);
  }
  return notices;
}
