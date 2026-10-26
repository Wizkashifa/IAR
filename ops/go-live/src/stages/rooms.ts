/**
 * Step 8. Groundwork for Events: compare IAR's room resources with the
 * Sheet's Rooms tab (reported, never created: the Admin console stays the
 * record of what rooms exist), and share each bookable room's calendar and
 * the main events calendar with portal@ so it can place holds.
 */
import { console_, mailbox } from "../config";
import type { CalendarResource } from "../google";
import { type Change, type Ctx, type Stage, Stop } from "../types";

const norm = (s: string) => s.toLowerCase().replace(/[–—-]/g, " ").replace(/[^a-z0-9&' ]/g, "").replace(/\s+/g, " ").trim();
const HOLD = /prayer|salah|salat|jum|school|pantry|hold|class/i;

export function matchRooms(sheet: { name: string; bookable: boolean | null }[], resources: CalendarResource[]) {
  const byName = new Map(resources.map((r) => [norm(r.name), r]));
  const matched: { name: string; resource: CalendarResource }[] = [];
  const missing: string[] = [];
  for (const r of sheet) {
    if (r.bookable !== true) continue;
    const hit = byName.get(norm(r.name));
    if (hit) matched.push({ name: r.name, resource: hit });
    else missing.push(r.name);
  }
  const listed = new Set(sheet.map((r) => norm(r.name)));
  const extra = resources.filter((r) => !listed.has(norm(r.name))).map((r) => r.name);
  const undecided = sheet.filter((r) => r.bookable === null).map((r) => r.name);
  return { matched, missing, extra, undecided };
}

async function canWrite(ctx: Ctx, calendarId: string, who: string): Promise<boolean> {
  const acl = await ctx.g.listCalendarAcl(calendarId);
  return acl.some((a) => a.email.toLowerCase() === who && (a.role === "writer" || a.role === "owner"));
}

export const rooms: Stage = {
  id: "rooms",
  title: "Room calendars (groundwork for Events)",
  async plan(ctx) {
    const { g, opt, state } = ctx;
    if (!ctx.members) throw new Stop("The members Sheet hasn't been read (step 1).");
    const out: Change[] = [];
    const portal = mailbox(opt.domain);
    const resources = await g.listCalendarResources();
    const m = matchRooms(ctx.members.rooms, resources);
    if (m.missing.length) out.push({ kind: "check", text: `Bookable on the Sheet but not a room resource in Google (add them in ${console_.resources}): ${m.missing.join("; ")}` });
    if (m.extra.length) out.push({ kind: "check", text: `Room resources in Google that aren't on the Sheet: ${m.extra.join("; ")}` });
    if (m.undecided.length) out.push({ kind: "check", text: `Bookable not answered (Yes or No) on the Sheet's Rooms tab, so left alone: ${m.undecided.join("; ")}` });

    for (const r of m.matched) {
      let shared: boolean;
      try {
        shared = await canWrite(ctx, r.resource.email, portal);
      } catch (e) {
        out.push({ kind: "check", text: `Google won't show who "${r.name}"'s calendar is shared with (${(e as Error).message}). Share it with ${portal} by hand in Google Calendar: "Make changes to events".` });
        continue;
      }
      if (!shared) out.push({ kind: "create", text: `Share the "${r.name}" room calendar with ${portal} (make changes to events)`, run: (c) => c.g.addCalendarWriter(r.resource.email, portal) });
      const events = await g.listEvents(r.resource.email).catch(() => null);
      if (events && !events.some((e) => e.recurring && HOLD.test(e.summary)))
        out.push({ kind: "check", text: `Warning: "${r.name}" has no recurring hold (prayer, Jumuah, school or pantry) on its calendar. Add standing holds so the portal sees those times as busy.` });
    }

    if (state.eventsCalendarId) {
      if (!(await canWrite(ctx, state.eventsCalendarId, portal)))
        out.push({ kind: "create", text: `Share IAR's main events calendar with ${portal} (make changes to events)`, run: (c) => c.g.addCalendarWriter(state.eventsCalendarId!, portal) });
    } else
      out.push({
        kind: "create",
        text: `Share IAR's main events calendar with ${portal} (make changes to events). go-live asks for its calendar ID once; leave it blank if IAR has none yet`,
        run: async (c) => {
          const id = (await c.prompt({ kind: "text", question: "  The main events calendar's ID (Google Calendar → its Settings → Integrate calendar → Calendar ID), or press Enter to skip:" })).trim();
          if (!id) return void c.log("  Skipped. Run go-live again later to share it.");
          c.state.eventsCalendarId = id;
          if (!(await canWrite(c, id, portal))) await c.g.addCalendarWriter(id, portal);
        },
      });
    return out;
  },
};
