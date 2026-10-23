import "server-only";
import { isDevAuth } from "./dev";
import { delegatedToken } from "./google";
import type { GoogleRoom, RoomSetting } from "./events/rooms";

/**
 * IAR's rooms, read from Google Workspace (Admin console → Buildings and
 * resources): each room resource with its building, capacity and calendar.
 * Read through the same read-only directory user as groups (lib/groups.ts),
 * with the calendar-resources read scope. Refreshed every 15 minutes; a
 * failed refresh keeps the last good list.
 */
const SCOPE = "https://www.googleapis.com/auth/admin.directory.resource.calendar.readonly";
const BASE = "https://admin.googleapis.com/admin/directory/v1/customer/my_customer/resources";
const REFRESH_MS = 15 * 60 * 1000;

type ApiRoom = { resourceId: string; resourceName?: string; resourceEmail: string; capacity?: number; buildingId?: string; userVisibleDescription?: string; resourceCategory?: string };
type ApiBuilding = { buildingId: string; buildingName?: string };

async function listAll<T>(token: string, path: string, key: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Room lookup failed: ${res.status}`);
    const body = (await res.json()) as Record<string, unknown> & { nextPageToken?: string };
    out.push(...((body[key] as T[] | undefined) ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out;
}

const cache = globalThis as unknown as { __iarRooms?: { at: number; rooms: GoogleRoom[] } };

export async function googleRooms(): Promise<GoogleRoom[]> {
  if (isDevAuth()) return DEV_ROOMS;
  const c = cache.__iarRooms;
  if (c && Date.now() - c.at < REFRESH_MS) return c.rooms;
  try {
    const subject = process.env.DIRECTORY_ADMIN_SUBJECT;
    if (!subject) throw new Error("DIRECTORY_ADMIN_SUBJECT is not set.");
    const token = await delegatedToken(subject, SCOPE);
    const [items, buildings] = await Promise.all([listAll<ApiRoom>(token, "calendars", "items"), listAll<ApiBuilding>(token, "buildings", "buildings").catch(() => [])]);
    const bName = new Map(buildings.map((b) => [b.buildingId, b.buildingName ?? b.buildingId]));
    const rooms = items
      .filter((r) => r.resourceCategory !== "OTHER" || r.capacity)
      .map((r) => ({ id: r.resourceId, name: r.resourceName?.trim() || r.resourceEmail, building: (r.buildingId && bName.get(r.buildingId)) || "", capacity: r.capacity ?? 0, calendarId: r.resourceEmail, description: r.userVisibleDescription }));
    cache.__iarRooms = { at: Date.now(), rooms };
    return rooms;
  } catch (err) {
    console.error("room lookup failed", err);
    const rooms = c?.rooms ?? [];
    cache.__iarRooms = { at: Date.now() - REFRESH_MS + 60_000, rooms };
    return rooms;
  }
}

// ---- Development: the rooms on today's Program Request Form ---------------

const dev = (id: string, name: string, capacity: number): GoogleRoom => ({ id, name, building: "Main campus", capacity, calendarId: `${id}@resource.dev.local` });

export const DEV_ROOMS: GoogleRoom[] = [
  dev("dev-mphA", "MPH A – half gym", 75),
  dev("dev-mphB", "MPH B – half gym", 75),
  dev("dev-mphAB", "MPH A&B – full gym", 150),
  dev("dev-cafe", "Al-Maidah Cafe", 50),
  dev("dev-main", "Main Prayer Hall", 300),
  dev("dev-behind", "Room behind Main Prayer Hall", 50),
  dev("dev-r220", "Room 220 – children's play room", 20),
  dev("dev-r230a", "Room 230A – glass room", 20),
  dev("dev-r230b", "Room 230B – glass room", 20),
  dev("dev-r240", "Room 240 – conference room", 30),
  dev("dev-r250", "Room 250 – An Noor meeting room", 20),
  dev("dev-r280", "Room 280 – EC meeting room", 20),
  dev("dev-women", "Women's Prayer Hall", 100),
  dev("dev-f3arabic", "3rd floor – Arabic Islamic Studies", 20),
  dev("dev-flex", "Community Flex Room", 40),
  dev("dev-rbArabic", "Red Brick – Arabic Islamic Studies", 30),
];

/** Dev: as if an admin had set up the rooms in Portal Settings. */
export const DEV_ROOM_SETTINGS: Record<string, RoomSetting> = Object.fromEntries(
  DEV_ROOMS.map((r) => {
    const s: RoomSetting = { bookable: true };
    if (/MPH|Cafe|Room 240/.test(r.name)) s.food = true;
    if (/MPH/.test(r.name)) s.mph = true;
    if (r.id === "dev-mphAB") s.overlaps = ["dev-mphA", "dev-mphB"];
    if (r.id === "dev-r240") s.restricted = true;
    if (r.id === "dev-cafe") s.note = "$100/hour minimum food and drink purchase.";
    return [r.id, s];
  }),
);
