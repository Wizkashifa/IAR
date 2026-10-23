/**
 * Who can open an event request. Approved events are on the IAR calendar for
 * everyone, so anyone signed in can open them. Before approval: the
 * requester, the committee's chairs, vice chairs and director, the
 * reviewers (executive), the teams that work events (office, marketing, A/V,
 * facilities, security) and portal admins. Plain functions.
 */
import type { Card } from "../cards";
import type { Viewing } from "../access";

const SEES_ALL: string[] = ["office", "executive", "marketing", "av", "facilities", "security"];

export function canViewEvent(card: Card, v: Viewing): boolean {
  if (card.ownerEmail.toLowerCase() === v.email.toLowerCase() || v.seeAll) return true;
  if (card.status === "approved" || card.status === "close_out" || card.status === "closed") return true;
  if (v.roles.some((r) => SEES_ALL.includes(r))) return true;
  const group = card.event?.committeeGroup?.toLowerCase();
  return Boolean(group && v.leads?.includes(group));
}
