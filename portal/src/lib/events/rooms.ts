/**
 * Rooms: what exists comes from IAR's room resources in Google (Admin
 * console → Buildings and resources), each with its own calendar. What
 * Google doesn't hold (bookable through the portal, food allowed, which
 * rooms share a space, who may book) is set in Portal Settings → Rooms.
 * Plain functions so they can be tested.
 */

/** A room resource as Google describes it. */
export type GoogleRoom = { id: string; name: string; building: string; capacity: number; calendarId: string; description?: string };

/** What Portal Settings adds to a room. */
export type RoomSetting = {
  /** Shown on the event form. Rooms are off until an admin turns them on. */
  bookable?: boolean;
  /** Food may be served here (room policy §8). */
  food?: boolean;
  /** Only leadership, imams and chairs may book it (Room 240, policy §10). */
  restricted?: boolean;
  /** Other rooms that share this space: booking one blocks the other (the full gym and its halves). */
  overlaps?: string[];
  /** Part of the MPH: needs a 2-hour cleaning gap (policy §4) and, for community events, a fee. */
  mph?: boolean;
  /** Shown on the form, e.g. "$100/hour minimum food and drink purchase". */
  note?: string;
};

/**
 * `name` is the short name people see everywhere; `fullName` is Google's
 * name as is, and `formerly` the old name it carried ("Previously Library"),
 * shown only in the room's details and on hover.
 */
export type Room = GoogleRoom & Required<Pick<RoomSetting, "bookable" | "food" | "restricted" | "mph">> & { overlaps: string[]; note: string; fullName: string; formerly?: string };

/**
 * "Community Room (Previously Library)" → "Community Room", with the old name
 * kept apart. Only a trailing "(Previously …)", "(Formerly …)" or "(was …)" is
 * taken off; any other bracket is part of the name.
 */
export function shortRoomName(name: string): { name: string; formerly?: string } {
  const m = name.match(/^(.*\S)\s*\(\s*((?:previously|formerly|was|old name:?)\s+[^)]+?)\s*\)\s*$/i);
  if (!m) return { name: name.trim() };
  return { name: m[1], formerly: m[2][0].toUpperCase() + m[2].slice(1) };
}

/** Google's rooms with their portal settings, sorted by building then name. */
export function mergeRooms(google: GoogleRoom[], settings: Record<string, RoomSetting>): Room[] {
  return google
    .map((g) => {
      const s = settings[g.id] ?? {};
      const short = shortRoomName(g.name);
      return { ...g, name: short.name, fullName: g.name, ...(short.formerly ? { formerly: short.formerly } : {}), bookable: Boolean(s.bookable), food: Boolean(s.food), restricted: Boolean(s.restricted), mph: Boolean(s.mph), overlaps: (s.overlaps ?? []).filter((x) => x !== g.id), note: s.note ?? "" };
    })
    .sort((a, b) => a.building.localeCompare(b.building) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Booking one of these rooms blocks the other (the same room, or rooms marked as sharing a space, either way round). */
export function roomsOverlap(a: Room | undefined, b: Room | undefined): boolean {
  if (!a || !b) return false;
  return a.id === b.id || a.overlaps.includes(b.id) || b.overlaps.includes(a.id);
}

/** Every room that shares space with any of these, including themselves: their calendars all need checking. */
export function roomsToCheck(ids: string[], rooms: Room[]): Room[] {
  const picked = rooms.filter((r) => ids.includes(r.id));
  return rooms.filter((r) => picked.some((p) => roomsOverlap(p, r)));
}

export const roomById = (rooms: Room[], id: string) => rooms.find((r) => r.id === id);
