/**
 * IT & Maintenance: the fields a ticket card carries on top of the shared
 * Card (see lib/cards.ts). Filled in by the IT & Maintenance module.
 */
export type TicketDetails = {
  /** Which team works it. */
  team: "it" | "facilities";
  room?: string;
};
