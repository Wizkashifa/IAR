/**
 * Events & Rooms: the fields an event card carries on top of the shared Card
 * (see lib/cards.ts). Filled in by the Events & Rooms module.
 */
export type EventDetails = {
  /** "YYYY-MM-DD": the event's (first) date. */
  date: string;
};
