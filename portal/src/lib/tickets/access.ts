/**
 * Who can open an IT & Maintenance ticket: the reporter, people following it,
 * IT Services and Facility Maintenance (either team: they hand tickets to each
 * other), the IAR office, executives (to look, not to work them), and portal
 * admins doing support (`seeAll`).
 * The same rule decides whether it opens, shows in search, or appears in a list.
 */
import type { Card } from "../cards";
import type { Viewing } from "../access";
import { isTicketCard, teamsOf } from "./workflow";
import { same } from "../text";

export function canViewTicket(card: Card, v: Viewing): boolean {
  if (same(card.ownerEmail, v.email) || v.seeAll) return true;
  if (!isTicketCard(card)) return false;
  const t = card.ticket;
  // IT Services and Facility Maintenance hand tickets to each other, so either team can open any ticket.
  return same(t.assigneeEmail, v.email) || t.watchers.some((w) => same(w, v.email)) || teamsOf(v).length > 0 || v.roles.includes("office") || v.roles.includes("executive");
}
