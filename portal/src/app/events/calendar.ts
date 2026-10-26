import type { AgendaItem } from "@/lib/agenda";
import type { Room } from "@/lib/events/rooms";
import type { TimelineItem } from "./ui";

/** A room and the rooms sharing its space (the full gym and each half). */
export function sharedSpace(rooms: Room[], room: Room): Set<string> {
  return new Set([room.id, ...rooms.filter((r) => r.overlaps.includes(room.id) || room.overlaps.includes(r.id)).map((r) => r.id)]);
}

/** What the timeline shows for one room on one day, from lib/agenda.ts. `skip`: a request not to show (the one being looked at). */
export function roomDay(agenda: AgendaItem[], rooms: Room[], room: Room, date: string, skip?: string): TimelineItem[] {
  const space = sharedSpace(rooms, room);
  return agenda
    .filter((a) => a.date === date && a.cardId !== skip && a.roomIds.some((id) => space.has(id)))
    .map((a) => ({
      start: a.holdStart ?? a.start,
      end: a.holdEnd ?? a.end,
      label: a.title,
      kind: a.pending ? "pending" : "booking",
    }));
}

/** The bookable room with the most on it that day, so the calendar opens on something useful. */
export function busiestRoom(agenda: AgendaItem[], rooms: Room[], bookable: Room[], date: string): Room | undefined {
  let best: Room | undefined;
  let most = 0;
  for (const r of bookable) {
    const n = roomDay(agenda, rooms, r, date).length;
    if (n > most) {
      most = n;
      best = r;
    }
  }
  return best ?? bookable[0];
}
