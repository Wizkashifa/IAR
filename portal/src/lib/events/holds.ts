import "server-only";
import type { HoldSpec } from "../calendar";
import { holdWindow } from "../calendar";
import { timeText, eventDates } from "./series";
import type { CalendarHold } from "./types";
import type { EventContext } from "./context";
import { type EventCard, holdsWanted } from "./workflow";

const portalUrl = (href: string) => `${(process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "")}${href}`;

function spec(card: EventCard, status: CalendarHold["status"]): Omit<HoldSpec, "status"> & { status: CalendarHold["status"] } {
  const e = card.event;
  const w = holdWindow(e);
  const all = eventDates(e.date, e.recur);
  return {
    cardId: card.id,
    summary: `${e.title} · ${e.committeeName}`,
    description: `Requested in the IAR Portal by ${card.ownerEmail}: ${portalUrl(`/events/${card.id}`)}\nEvent ${timeText(e.start)}–${timeText(e.end)}. Held ${timeText(w.start)}–${timeText(w.end)} with setup and cleanup.`,
    date: e.date,
    start: w.start,
    end: w.end,
    recur: e.recur,
    except: all.filter((d) => !e.dates.includes(d)),
    status,
  };
}

/**
 * Make the card's holds on the room calendars match its stage: tentative
 * while in review, confirmed once approved, none when sent back, denied or
 * cancelled. Returns the card with its holds updated. A calendar failure
 * doesn't undo the action: it comes back as `error` for the history and the
 * office.
 */
export async function syncHolds(card: EventCard, ctx: EventContext): Promise<{ card: EventCard; error?: string }> {
  const want = holdsWanted(card);
  let holds = [...card.event.holds];
  // Holds made so far, so a failure part-way doesn't lose track of what's on the calendar.
  const made: CalendarHold[] = [];
  try {
    if (want === "none") {
      for (const h of holds) await ctx.calendar.deleteHold(h.calendarId, h.eventId);
      holds = [];
    } else {
      const status = want === "keep" ? (holds[0]?.status ?? "tentative") : want;
      const s = spec(card, status);
      const next: CalendarHold[] = [];
      for (const roomId of card.event.rooms) {
        const room = ctx.rooms.find((r) => r.id === roomId);
        if (!room) continue;
        const have = holds.find((h) => h.roomId === roomId && h.calendarId === room.calendarId);
        if (have) {
          await ctx.calendar.updateHold(have.calendarId, have.eventId, s);
          next.push({ ...have, status });
        } else if (want !== "keep") {
          const h = { roomId, calendarId: room.calendarId, eventId: await ctx.calendar.createHold(room.calendarId, s), status };
          made.push(h);
          next.push(h);
        }
      }
      for (const h of holds) if (!next.some((n) => n.eventId === h.eventId)) await ctx.calendar.deleteHold(h.calendarId, h.eventId);
      holds = next;
    }
    return { card: { ...card, event: { ...card.event, holds } } };
  } catch (err) {
    console.error("calendar hold sync failed", err);
    return { card: { ...card, event: { ...card.event, holds: [...holds, ...made] } }, error: "The room calendar couldn't be updated. The office has been told and will fix the calendar by hand." };
  }
}
