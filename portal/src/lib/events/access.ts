/**
 * Who can open a event request. Replaced by the module's real rule.
 */
import type { Card } from "../cards";
import type { Viewing } from "../access";

export function canViewEvent(card: Card, v: Viewing): boolean {
  return card.ownerEmail.toLowerCase() === v.email.toLowerCase() || Boolean(v.seeAll);
}
