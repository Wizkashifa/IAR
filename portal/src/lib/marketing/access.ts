/**
 * Who can open a marketing request. Replaced by the module's real rule.
 */
import type { Card } from "../cards";
import type { Viewing } from "../access";

export function canViewMarketing(card: Card, v: Viewing): boolean {
  return card.ownerEmail.toLowerCase() === v.email.toLowerCase() || Boolean(v.seeAll);
}
