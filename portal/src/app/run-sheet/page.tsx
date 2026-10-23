import Link from "next/link";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { campusesOf, runSheetRows } from "@/lib/runsheet";
import { eventContext } from "@/lib/events/context";
import { addDays, isDate, timeText } from "@/lib/events/series";
import { type EventCard, isEventCard } from "@/lib/events/workflow";
import { Flash, fmtDay } from "../ui";
import { RoomCheckCell } from "../events/ops-ui";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  "check-ok": "Room check saved.",
  "check-problem": "Room check saved. The requester and the IAR office have been told about the problem.",
};

const SEES = ["office", "facilities", "security", "admins"];

export default async function RunSheetPage({ searchParams }: { searchParams: Promise<{ date?: string; campus?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  if (!viewer.roles.some((r) => SEES.includes(r))) {
    return (
      <>
        <h1>Daily Run Sheet</h1>
        <div className="panel empty">The run sheet is for the IAR office, facilities and security.</div>
      </>
    );
  }
  const ctx = await eventContext();
  const date = isDate(sp.date) ? sp.date : ctx.today;
  const campuses = campusesOf(ctx.rooms);
  const campus = campuses.includes(sp.campus ?? "") ? sp.campus! : campuses[0];
  const here = ctx.rooms.filter((r) => (r.building || "Other rooms") === campus);
  const [cards, busy] = await Promise.all([
    (await cardStore()).listByType("event", ["approved", "close_out"]),
    here.length ? ctx.calendar.listBusy(here.map((r) => ({ roomId: r.id, calendarId: r.calendarId })), date, date) : Promise.resolve([]),
  ]);
  const events = cards.filter(isEventCard);
  const byId = new Map<string, EventCard>(events.map((c) => [c.id, c]));
  const rows = runSheetRows(events, busy, ctx.rooms, date, campus);
  const eventCount = rows.filter((r) => r.kind === "event").length;
  const q = (d: string) => `/run-sheet?date=${d}${campus ? `&campus=${encodeURIComponent(campus)}` : ""}`;
  const back = q(date);

  return (
    <>
      <div className="pagehead noprint">
        <div>
          <h1>Daily Run Sheet</h1>
          <p className="lead">What&apos;s happening where, from approved events and the room calendars. Each group sets up and cleans up its own event.</p>
        </div>
        <PrintButton />
      </div>
      <Flash ok={sp.ok} error={sp.error} messages={MESSAGES} />
      <form className="row noprint" action="/run-sheet" style={{ marginBottom: 16 }}>
        <input type="date" name="date" defaultValue={date} aria-label="Day" style={{ maxWidth: 180 }} />
        {campuses.length > 1 && (
          <select name="campus" defaultValue={campus} aria-label="Campus">
            {campuses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {campuses.length === 1 && <input type="hidden" name="campus" value={campus} />}
        <button className="button secondary" type="submit">Show</button>
        <Link className="button secondary" href={q(addDays(date, -1))} aria-label="Day before">←</Link>
        <Link className="button secondary" href={q(ctx.today)}>Today</Link>
        <Link className="button secondary" href={q(addDays(date, 1))} aria-label="Next day">→</Link>
      </form>

      <div className="sheet">
        <div className="sheet-h">
          <h2>{campus ?? "IAR"} · {fmtDay(date)}</h2>
          <span className="sub">{eventCount} event{eventCount === 1 ? "" : "s"} · {rows.length - eventCount} other calendar entr{rows.length - eventCount === 1 ? "y" : "ies"}</span>
        </div>
        {rows.length === 0 ? (
          <div className="panel empty">Nothing on the room calendars this day.</div>
        ) : (
          <div className="tablewrap">
            <table className="table runsheet">
              <thead>
                <tr>
                  <th>Room hold</th>
                  <th>Room</th>
                  <th>What</th>
                  <th>Contact</th>
                  <th className="num">People</th>
                  <th>Setup and A/V</th>
                  <th>Security</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) =>
                  r.kind === "event" ? (
                    <tr key={`e${r.cardId}`}>
                      <td className="nowrap">
                        <strong>{timeText(r.start)}–{timeText(r.end)}</strong>
                        <div className="sub">Event {timeText(r.eventStart)}–{timeText(r.eventEnd)}</div>
                        {(r.setup > 0 || r.teardown > 0) && <div className="sub">{r.setup} min setup, {r.teardown} min cleanup</div>}
                        {r.afterHours && <span className="flag">After hours</span>}
                      </td>
                      <td>{r.rooms.join(", ")}</td>
                      <td>
                        <Link href={`/events/${r.cardId}`}><strong>{r.title}</strong></Link>
                        <div className="sub">{r.committee} · {r.cardId}{r.series ? " · series" : ""}{r.closeOut ? " · closing out" : ""}</div>
                      </td>
                      <td>{r.contact}</td>
                      <td className="num">{r.attendance}</td>
                      <td>
                        {r.setupNotes || <span className="sub">No special setup</span>}
                        {r.av && <div className="sub">A/V: {r.av}</div>}
                      </td>
                      <td>
                        <div>{r.security.join(" ")}</div>
                        {byId.get(r.cardId) && (
                          <div className="checkcells">
                            <RoomCheckCell card={byId.get(r.cardId)!} date={date} when="before" check={r.checks.before} roles={viewer.actingRoles} back={back} />
                            <RoomCheckCell card={byId.get(r.cardId)!} date={date} when="after" check={r.checks.after} roles={viewer.actingRoles} back={back} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr key={`c${i}`} className="calrow">
                      <td className="nowrap">
                        {timeText(r.start)}–{timeText(r.end)}
                        {r.afterHours && <span className="flag">After hours</span>}
                      </td>
                      <td>{r.rooms.join(", ")}</td>
                      <td>
                        {r.title}
                        <div className="sub">{r.entry === "standing" ? "Standing hold (room policy)" : "Calendar entry"}</div>
                      </td>
                      <td colSpan={4} className="sub">On the IAR calendar, not booked through the portal.</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
