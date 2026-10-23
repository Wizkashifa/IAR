/**
 * Who can open a marketing request: the requester, the marketing team, the
 * IAR office and executives, anyone who has acted on it, and portal admins
 * (`seeAll`, for support). The same rule decides search and lists (see
 * lib/access.ts). Plain function so it can be tested.
 *
 * Committee chairs don't see their members' marketing requests here: a
 * request's committee is a team name, and the viewer's oversight is kept by
 * fund (`oversees`), so there's no reliable match yet.
 */
import type { Card } from "../cards";
import type { Viewing } from "../access";

const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export function canViewMarketing(card: Card, v: Viewing): boolean {
  if (same(card.ownerEmail, v.email) || v.seeAll) return true;
  if (v.roles.some((r) => r === "marketing" || r === "office" || r === "executive")) return true;
  return Boolean(card.marketing?.history.some((h) => same(h.by, v.email)));
}
