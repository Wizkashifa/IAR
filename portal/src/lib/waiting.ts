import "server-only";
import { cardStore, type Card } from "./cards";
import { eventActor } from "./events/context";
import { slotRequestStore } from "./events/slot-requests-store";
import type { SlotRequest } from "./events/slot-requests";
import { directory } from "./groups";
import { needsViewer, slotAsksFor, type NeedsContext } from "./needs-you";
import { addressesOf } from "./notifications";
import { actorFor } from "./people";
import type { Actor } from "./purchases/workflow";
import { teamPeople } from "./teams";
import type { Viewer } from "./viewer";

export type Waiting = {
  /** Requests waiting on this person, newest activity first. */
  cards: Card[];
  /** Asks for a room time this person booked, waiting for their answer. */
  asks: SlotRequest[];
  actor: Actor;
  ctx: NeedsContext;
};

/**
 * Everything waiting on this person, across every module: the one rule behind
 * both the count beside Home in the menu and the home page's "Waiting on you",
 * so the two always agree.
 */
export async function waitingFor(viewer: Viewer): Promise<Waiting> {
  const store = await cardStore();
  const [actor, dir, asks, ...lists] = await Promise.all([
    actorFor(viewer),
    directory(),
    slotRequestStore().then((s) => s.listWaitingOn(addressesOf(viewer))),
    store.listByOwner(viewer.email),
    store.listOpenPurchases(),
    store.listByType("event"),
    store.listByType("marketing"),
    store.listByType("ticket"),
  ]);
  const byId = new Map<string, Card>();
  for (const c of lists.flat()) byId.set(c.id, c);
  const ctx = contextFrom(dir);
  const cards = [...byId.values()].filter((c) => needsViewer(c, actor, ctx)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { cards, asks: slotAsksFor(asks, eventActor(viewer)), actor, ctx };
}

const contextFrom = (dir: Awaited<ReturnType<typeof directory>>): NeedsContext => ({ directorsOf: (group: string) => teamPeople(dir, group).directors });

/** What needsViewer needs to know beyond the card (who directs each committee), for pages that group their own lists. */
export async function needsContext(): Promise<NeedsContext> {
  return contextFrom(await directory());
}
