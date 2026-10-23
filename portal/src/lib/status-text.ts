/**
 * A request's status in words, using its module's own steps where they say
 * more than the shared status ("Scheduled" rather than "Approved", "Fixed:
 * please confirm" rather than "Close-out"). For lists that mix every kind of
 * request: My Requests, the home page and search. Plain function.
 */
import { STATUS_LABEL, type Card } from "./cards";
import { STAGE_LABEL as EVENT_STAGE } from "./events/workflow";
import { STAGE_LABEL as MARKETING_STAGE } from "./marketing/types";
import { STATUS_LABEL as TICKET_STATUS } from "./tickets/types";

export function statusText(card: Card): string {
  if (card.event && (card.status === "submitted" || card.status === "in_review")) return EVENT_STAGE[card.event.stage];
  if (card.marketing) return MARKETING_STAGE[card.marketing.stage] ?? STATUS_LABEL[card.status];
  if (card.ticket) return card.ticket.status === "resolved" ? "Fixed: please confirm" : (TICKET_STATUS[card.ticket.status] ?? STATUS_LABEL[card.status]);
  return STATUS_LABEL[card.status];
}
