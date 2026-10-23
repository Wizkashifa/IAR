/**
 * Linking a purchase request to an event, so the event's costs add up at
 * close-out. The purchase form offers the requester's own approved events
 * (and ones in close-out) and their committees' upcoming approved events.
 * Plain functions so they can be tested.
 */
import { dayText } from "./series";
import type { EventCard } from "./workflow";

export type EventChoice = { id: string; label: string };

const lc = (s: string) => s.trim().toLowerCase();

/** The events this person may link a purchase to. `groups`: the team groups they're on. */
export function linkableEvents(cards: EventCard[], who: { email: string; groups: string[] }, today: string): EventChoice[] {
  const groups = new Set(who.groups.map(lc));
  const picked = cards.filter((c) => {
    if (lc(c.ownerEmail) === lc(who.email)) return c.status === "approved" || c.status === "close_out";
    return c.status === "approved" && groups.has(lc(c.event.committeeGroup)) && c.event.dates.some((d) => d >= today);
  });
  const when = (c: EventCard) => c.event.dates.find((d) => d >= today) ?? c.event.dates[c.event.dates.length - 1] ?? c.event.date;
  return picked
    .sort((a, b) => when(a).localeCompare(when(b)) || a.id.localeCompare(b.id))
    .map((c) => ({ id: c.id, label: `${c.title} · ${c.event.committeeName} · ${dayText(when(c))}${c.event.dates.length > 1 ? " (series)" : ""}${c.status === "close_out" ? " · closing out" : ""} · ${c.id}` }));
}
