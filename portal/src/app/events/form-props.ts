import "server-only";
import { cardStore } from "@/lib/cards";
import { libraryPolicyUrl } from "@/lib/library";
import { portalSettings } from "@/lib/portal-settings";
import type { Viewer } from "@/lib/viewer";
import { type EventContext, committeesFor } from "@/lib/events/context";
import { isEventCard } from "@/lib/events/workflow";
import { marketingFolder } from "@/lib/marketing/drive";
import type { EventFormProps } from "./EventForm";

/**
 * What every event form starts from: the committees this person can request
 * for (starting on the one they used last, or one they chair), the rooms with
 * the ones they book most first, and the room policy link (Portal Settings,
 * or the Library's current room policy), and whether images for marketing
 * can be uploaded.
 */
export async function formProps(viewer: Viewer, ctx: EventContext, extra?: { group: string; name: string }): Promise<Pick<EventFormProps, "committees" | "defaultCommittee" | "rooms" | "usedMost" | "policyUrl" | "today" | "uploads">> {
  const committees = committeesFor(viewer, ctx.dir);
  if (extra && !committees.some((c) => c.group === extra.group)) committees.unshift(extra);
  const [mine, settings, fromLibrary, folder] = await Promise.all([(await cardStore()).listByOwner(viewer.email), portalSettings(), libraryPolicyUrl("rooms"), marketingFolder()]);
  const events = mine.filter(isEventCard).sort((a, b) => ((b.createdAt ?? b.updatedAt) > (a.createdAt ?? a.updatedAt) ? 1 : -1));
  const has = (g?: string) => Boolean(g && committees.some((c) => c.group === g));
  const lastUsed = events.find((c) => has(c.event.committeeGroup))?.event.committeeGroup;
  const rank = { chair: 0, vice: 1, member: 2 } as const;
  const chaired = [...viewer.teams].sort((a, b) => rank[a.role] - rank[b.role]).find((t) => t.role !== "member" && has(t.group))?.group;
  // Rooms this person has booked, most often first.
  const count = new Map<string, number>();
  for (const c of events) for (const r of c.event.rooms) count.set(r, (count.get(r) ?? 0) + 1);
  const usedMost = [...count.entries()]
    .filter(([id]) => ctx.bookable.some((r) => r.id === id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => id);
  return {
    committees,
    defaultCommittee: lastUsed ?? chaired ?? committees[0]?.group,
    rooms: ctx.bookable.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, building: r.building, food: r.food, ...(r.formerly ? { formerly: r.formerly } : {}) })),
    usedMost,
    // A link an admin set wins; otherwise the room policy from the Library.
    policyUrl: settings.roomPolicyUrl || fromLibrary || undefined,
    today: ctx.today,
    uploads: Boolean(folder),
  };
}
