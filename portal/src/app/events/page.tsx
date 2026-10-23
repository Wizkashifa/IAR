import Link from "next/link";
import { cardStore, STATUS_LABEL } from "@/lib/cards";
import { addressesOf } from "@/lib/notifications";
import { requireViewer } from "@/lib/viewer";
import { eventActor, eventContext } from "@/lib/events/context";
import { roomById } from "@/lib/events/rooms";
import { addDays, dayText, isDate, recurText, timeText } from "@/lib/events/series";
import { datesText, SLOT_STATUS_LABEL } from "@/lib/events/slot-requests";
import { slotRequestStore } from "@/lib/events/slot-requests-store";
import { type EventCard, STAGE_LABEL, isEventCard, reviewableBy, upcoming } from "@/lib/events/workflow";
import { Timeline } from "./ui";

export const dynamic = "force-dynamic";

function EventTable({ cards, empty, showOwner, rooms }: { cards: EventCard[]; empty: string; showOwner?: boolean; rooms: Awaited<ReturnType<typeof eventContext>>["rooms"] }) {
  if (cards.length === 0) return <div className="panel empty">{empty}</div>;
  return (
    <div className="tablewrap">
      <table className="table">
        <thead>
          <tr>
            <th>Event</th>
            <th>When</th>
            <th>Room</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => {
            const e = c.event;
            return (
              <tr key={c.id}>
                <td>
                  <Link href={`/events/${c.id}`}><strong>{c.title}</strong></Link>
                  <div className="sub">{c.id} · {e.committeeName}{showOwner ? ` · ${c.ownerEmail}` : ""}</div>
                </td>
                <td className="nowrap">
                  {dayText(e.dates[0] ?? e.date)}
                  <div className="sub">{timeText(e.start)}–{timeText(e.end)}{e.recur ? ` · ${recurText(e.date, e.recur)}` : ""}</div>
                </td>
                <td>{e.rooms.length ? e.rooms.map((r) => roomById(rooms, r)?.name ?? r).join(", ") : <span className="sub">Off-site</span>}</td>
                <td>
                  <span className={`pill ${c.status}`}>{c.status === "in_review" || c.status === "submitted" ? STAGE_LABEL[e.stage] : STATUS_LABEL[c.status]}</span>
                  {c.waitingOn && <div className="sub">{c.waitingOn}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ room?: string; date?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const actor = eventActor(viewer);
  const ctx = await eventContext();
  const store = await cardStore();
  const [mine, open, asks] = await Promise.all([
    store.listByOwner(viewer.email),
    store.listByType("event", ["submitted", "in_review", "approved"]),
    (await slotRequestStore()).listWaitingOn(addressesOf(viewer)),
  ]);
  const events = open.filter(isEventCard);
  const review = reviewableBy(events, actor, (c) => ctx.directorsOf(c.event.committeeGroup));
  const myEvents = mine.filter(isEventCard);
  const soon = upcoming(events.filter((c) => c.status === "approved"), ctx.today).slice(0, 25);

  const room = roomById(ctx.bookable, sp.room ?? "") ?? ctx.bookable[0];
  const date = isDate(sp.date) ? sp.date : ctx.today;
  const busy = room ? (await ctx.calendar.listBusy([{ roomId: room.id, calendarId: room.calendarId }, ...ctx.rooms.filter((r) => r.id !== room.id && (r.overlaps.includes(room.id) || room.overlaps.includes(r.id))).map((r) => ({ roomId: r.id, calendarId: r.calendarId }))], date, date)) : [];
  const seen = new Set<string>();
  const items = busy.filter((b) => !seen.has(`${b.label}|${b.start}`) && Boolean(seen.add(`${b.label}|${b.start}`))).map((b) => ({ start: b.start, end: b.end, label: b.label, kind: b.kind }));

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Events &amp; Rooms</h1>
          <p className="lead">Request a program or event and book its room. Rooms are checked against the IAR calendar as you fill in the request.</p>
        </div>
        <Link href="/events/new" className="button">New event request</Link>
      </div>

      {asks.length > 0 && (
        <>
          <h2>Asks for your booked time ({asks.length})</h2>
          <div className="attention">
            <ul>
              {asks.map((a) => (
                <li key={a.id}>
                  <Link href={`/events/${a.hold.cardId ?? a.fromCard}#asks`}><strong>{a.requesterName} asks for {a.hold.room}, {datesText(a.dates)}</strong></Link>
                  <div className="what">{a.id} · held by {a.hold.label} · {SLOT_STATUS_LABEL[a.status]} · “{a.reason}”</div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {review.length > 0 && (
        <>
          <h2>Needs your review ({review.length})</h2>
          <EventTable cards={review} rooms={ctx.rooms} showOwner empty="" />
        </>
      )}

      <h2>Your requests</h2>
      <EventTable cards={myEvents} rooms={ctx.rooms} empty="You haven't requested an event yet." />

      <h2>Upcoming at IAR</h2>
      <EventTable cards={soon.filter((c) => c.ownerEmail !== actor.email)} rooms={ctx.rooms} showOwner empty="Nothing else booked through the portal yet." />

      <h2>Room calendar</h2>
      <div className="panel">
        <form className="row" action="/events">
          <select name="room" defaultValue={room?.id} aria-label="Room">
            {ctx.bookable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input type="date" name="date" defaultValue={date} aria-label="Date" style={{ maxWidth: 180 }} />
          <button className="button secondary" type="submit">Show</button>
          <Link className="button secondary" href={`/events?room=${room?.id ?? ""}&date=${addDays(date, -1)}`}>←</Link>
          <Link className="button secondary" href={`/events?room=${room?.id ?? ""}&date=${addDays(date, 1)}`}>→</Link>
        </form>
        {room ? <div style={{ marginTop: 12 }}><Timeline items={items} caption={`${room.name} · ${dayText(date)}`} /></div> : <p className="note">No rooms are set up for booking yet. An admin turns rooms on in Portal Settings.</p>}
      </div>
    </>
  );
}
