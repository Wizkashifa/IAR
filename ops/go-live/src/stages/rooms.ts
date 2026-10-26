/**
 * Step 8. Groundwork for Events. IAR's room resources in Google are the list
 * (never created here: the Admin console stays the record of what rooms
 * exist). go-live asks once which rooms people can't book (the Sheet's Rooms
 * tab can also say Yes or No), shares each bookable room's calendar and the
 * main events calendar with portal@ so it can place holds, and remembers the
 * bookable rooms for Portal Settings (step 10).
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

/**
 * Which of Google's rooms people can book: Yes on the Sheet's Rooms tab, or
 * not decided there and not among the rooms the admin left out. "undecided"
 * is what go-live has to ask about.
 */
export function pickRooms(sheet: { name: string; bookable: boolean | null }[], resources: CalendarResource[], leftOut: string[] | undefined) {
  const said = new Map(sheet.filter((r) => r.bookable !== null).map((r) => [norm(r.name), r.bookable]));
  const out = new Set((leftOut ?? []).map(norm));
  const undecided = resources.filter((r) => !said.has(norm(r.name)));
  const bookable = resources.filter((r) => said.get(norm(r.name)) === true || (!said.has(norm(r.name)) && leftOut !== undefined && !out.has(norm(r.name))));
  return { bookable, undecided };
}

/** A room calendar with no standing holds (prayers, Jumuah, school, pantry) would show those times as free. */
async function holdWarning(ctx: Ctx, r: CalendarResource): Promise<string | null> {
  const events = await ctx.g.listEvents(r.email).catch(() => null);
  return events && !events.some((e) => e.recurring && HOLD.test(e.summary))
    ? `Warning: "${r.name}" has no recurring hold (prayer, Jumuah, school or pantry) on its calendar. Add standing holds so the portal sees those times as busy.`
    : null;
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

    // Google's room resources are the list. The Sheet can say Yes or No for a room;
    // the rest, go-live asks about once ("which to leave out"), and remembers.
    const p = pickRooms(ctx.members.rooms, resources, state.roomsLeftOut);
    if (p.undecided.length && !state.roomsLeftOut) {
      out.push({
        kind: "create",
        text: `Choose which of IAR's ${resources.length} rooms people can book (go-live asks once), and share each one's calendar with ${portal} (make changes to events)`,
        run: async (c) => {
          c.log(`  IAR's rooms in Google: ${p.undecided.map((r) => r.name).join("; ")}`);
          for (;;) {
            const typed = (await c.prompt({ kind: "text", question: "  Rooms people can't book, separated by commas (press Enter if they all can):" })).split(/[,;]/).map((x) => x.trim()).filter(Boolean);
            const unknown = typed.filter((t) => !p.undecided.some((r) => norm(r.name) === norm(t)));
            if (unknown.length) {
              c.log(`  Not a room in the list: ${unknown.join("; ")}. Type the names as listed above.`);
              continue;
            }
            c.state.roomsLeftOut = typed;
            break;
          }
          const chosen = pickRooms(c.members!.rooms, resources, c.state.roomsLeftOut).bookable;
          for (const r of chosen) {
            if (!(await canWrite(c, r.email, portal).catch(() => false))) await c.g.addCalendarWriter(r.email, portal);
            const w = await holdWarning(c, r);
            if (w) c.log(`  ${w}`);
          }
          c.state.bookableRooms = chosen.map((r) => r.email);
          c.log(`  ${chosen.length} rooms can be booked; their calendars are shared with ${portal}.`);
        },
      });
    } else {
      const want = p.bookable.map((r) => r.email);
      if (JSON.stringify(state.bookableRooms ?? []) !== JSON.stringify(want))
        out.push({ kind: "update", text: `Remember the ${want.length} rooms people can book, for Portal Settings (step 10)`, run: async (c) => void (c.state.bookableRooms = want) });
      for (const r of p.bookable) {
        let shared: boolean;
        try {
          shared = await canWrite(ctx, r.email, portal);
        } catch (e) {
          out.push({ kind: "check", text: `Google won't show who "${r.name}"'s calendar is shared with (${(e as Error).message}). Share it with ${portal} by hand in Google Calendar: "Make changes to events".` });
          continue;
        }
        if (!shared) out.push({ kind: "create", text: `Share the "${r.name}" room calendar with ${portal} (make changes to events)`, run: (c) => c.g.addCalendarWriter(r.email, portal) });
        const w = await holdWarning(ctx, r);
        if (w) out.push({ kind: "check", text: w });
      }
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
