/**
 * Who can open an IT & Maintenance ticket: the reporter, people following it,
 * the ticket's team (IT Services for IT tickets, Facility Maintenance for
 * facilities), the IAR office, and portal admins doing support (`seeAll`).
 * The same rule decides whether it opens, shows in search, or appears in a list.
 */
import type { Card } from "../cards";
import type { Viewing } from "../access";
import { isTicketCard, onTeam } from "./workflow";
import { same } from "../text";

export function canViewTicket(card: Card, v: Viewing): boolean {
  if (same(card.ownerEmail, v.email) || v.seeAll) return true;
  if (!isTicketCard(card)) return false;
  const t = card.ticket;
  return same(t.assigneeEmail, v.email) || t.watchers.some((w) => same(w, v.email)) || onTeam(v, t.team) || v.roles.includes("office");
}
