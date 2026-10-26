/**
 * The kinds of request, one row each: where its pages are, what it's called,
 * and which field on the card holds its own details. Lists that mix every
 * kind (My Requests, What's stuck, search, the beta measures) read this, so a
 * new kind of request is one row here plus its module (lib/registry.ts).
 * Plain data and functions, safe anywhere.
 */
import type { Card, CardType } from "./cards";
import type { HistoryEntry } from "./workflow-core";

export type Kind = {
  type: CardType;
  /** Where its pages are. */
  path: string;
  /** One request, in a list that mixes kinds ("Purchase PO-12001"). */
  one: string;
  /** The filter chip and section heading. */
  many: string;
  /** Its id in lib/modules.ts, for who can see it. */
  module: string;
  /** The "new request" button. */
  newLabel: string;
};

export const KINDS: Kind[] = [
  { type: "event", path: "/events", one: "Event", many: "Events", module: "events", newLabel: "New event request" },
  { type: "purchase", path: "/purchases", one: "Purchase", many: "Purchases", module: "purchase-requests", newLabel: "New purchase request" },
  { type: "marketing", path: "/marketing", one: "Marketing", many: "Marketing", module: "marketing-requests", newLabel: "New marketing request" },
  { type: "ticket", path: "/it-maintenance", one: "AV/IT/Maintenance", many: "AV/IT/Maintenance", module: "it-maintenance", newLabel: "AV/IT/Maintenance" },
];

export const kindOf = (type: CardType): Kind | undefined => KINDS.find((k) => k.type === type);

/** The request's own page, or null for a kind that has no page yet. */
export function hrefOf(card: Pick<Card, "id" | "type">): string | null {
  const k = kindOf(card.type);
  return k ? `${k.path}/${card.id}` : null;
}

/** The module's own fields on a card ("card.purchase" for a purchase): every module keeps its history there. */
type Details = { history: HistoryEntry[]; stageSince?: string; statusSince?: string };
const FIELD: Partial<Record<CardType, "purchase" | "event" | "marketing" | "ticket">> = { purchase: "purchase", event: "event", marketing: "marketing", ticket: "ticket" };

export function detailsOf(card: Card): Details | undefined {
  const f = FIELD[card.type];
  return f ? card[f] : undefined;
}

/** The request's history, whatever kind it is. */
export const historyOf = (card: Card): HistoryEntry[] => detailsOf(card)?.history ?? [];

/** When it reached its current step, from the module's own field. */
export const stepSinceOf = (card: Card): string | undefined => {
  const d = detailsOf(card);
  return d?.stageSince ?? d?.statusSince;
};

/** The card with one more history line. */
export function withHistory(card: Card, entry: HistoryEntry): Card {
  const f = FIELD[card.type];
  const d = f && card[f];
  return f && d ? { ...card, [f]: { ...d, history: [...d.history, entry] } } : card;
}
