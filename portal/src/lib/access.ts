/**
 * Who can open which request, for every kind of card: the same rule decides
 * whether a request opens, shows in search, or appears in a list. Each
 * module keeps its own rule; this picks the right one. Plain functions.
 */
import type { Card } from "./cards";
import { canViewEvent } from "./events/access";
import { canViewMarketing } from "./marketing/access";
import { canViewDetail, isPurchaseCard, type Actor } from "./purchases/workflow";
import { canViewTicket } from "./tickets/access";

/** The person looking, with their own group roles; `seeAll` for portal admins doing support. */
export type Viewing = Actor & { seeAll?: boolean };

export function canOpenCard(card: Card, v: Viewing): boolean {
  switch (card.type) {
    case "purchase":
      return isPurchaseCard(card) && canViewDetail(card, v);
    case "event":
      return canViewEvent(card, v);
    case "marketing":
      return canViewMarketing(card, v);
    case "ticket":
      return canViewTicket(card, v);
    default:
      return card.ownerEmail.toLowerCase() === v.email.toLowerCase() || Boolean(v.seeAll);
  }
}
