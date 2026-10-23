/**
 * Who can open a marketing request: the requester, the marketing team, the
 * IAR office and executives, the requesting committee's chairs, vice chairs
 * and director, anyone who has acted on it, and portal admins (`seeAll`, for
 * support). The same rule decides search and lists (see lib/access.ts).
 * Plain function so it can be tested.
 */
import type { Card } from "../cards";
import type { Viewing } from "../access";
import { groupSlug, teamSlug } from "../teams";

const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export function canViewMarketing(card: Card, v: Viewing): boolean {
  if (same(card.ownerEmail, v.email) || v.seeAll) return true;
  if (v.roles.some((r) => r === "marketing" || r === "office" || r === "executive")) return true;
  // The request names its committee; the viewer's chair, vice-chair and director roles are by team group.
  if (card.committee && v.leads?.some((g) => groupSlug(g) === teamSlug(card.committee))) return true;
  return Boolean(card.marketing?.history.some((h) => same(h.by, v.email)));
}
