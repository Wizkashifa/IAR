/**
 * Where each kind of request opens. Plain functions so they can be tested.
 */
import type { Card, CardType } from "./cards";

const PATH: Partial<Record<CardType, string>> = {
  purchase: "/purchases",
  event: "/events",
  marketing: "/marketing",
  ticket: "/it-maintenance",
};

/** The request's own page, or null for a kind that has no page yet. */
export function hrefOf(card: Pick<Card, "id" | "type">): string | null {
  const base = PATH[card.type];
  return base ? `${base}/${card.id}` : null;
}
