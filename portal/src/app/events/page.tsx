import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { ItemList, groupedRows, rowsFor, sectionsOf } from "@/components/ItemList";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { agendaBetween } from "@/lib/agenda";
import { type RowData, emailsIn } from "@/lib/card-row";
import { cardStore } from "@/lib/cards";
import { nameResolver } from "@/lib/names";
import { groupForViewer } from "@/lib/needs-you";
import { addressesOf } from "@/lib/notifications";
import { actorFor } from "@/lib/people";
import { requireViewer } from "@/lib/viewer";
import { eventActor, eventContext } from "@/lib/events/context";
import { roomById } from "@/lib/events/rooms";
import { dayText, isDate } from "@/lib/events/series";
import { datesText, SLOT_STATUS_LABEL } from "@/lib/events/slot-requests";
import { slotRequestStore } from "@/lib/events/slot-requests-store";
import { isEventCard, reviewableBy, upcoming } from "@/lib/events/workflow";
import { busiestRoom, roomDay } from "./calendar";
import { RoomDay } from "./RoomDay";
import { Timeline } from "./ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events & Rooms" };

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ room?: string; date?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const ev = eventActor(viewer);
  const ctx = await eventContext();
  const store = await cardStore();
  const date = isDate(sp.date) ? sp.date : ctx.today;
  const [actor, mine, open, asks, agenda] = await Promise.all([
    actorFor(viewer),
    store.listByOwner(viewer.email),
    store.listByType("event", ["submitted", "in_review", "approved"]),
    (await slotRequestStore()).listWaitingOn(addressesOf(viewer)),
    agendaBetween(date, date, { standing: true }),
  ]);
  const events = open.filter(isEventCard);
  const myEvents = mine.filter(isEventCard);
  const review = reviewableBy(events, ev, (c) => ctx.directorsOf(c.event.committeeGroup));
  const soon = upcoming(events.filter((c) => c.status === "approved" && c.ownerEmail !== ev.email), ctx.today).slice(0, 25);
  const needs = { directorsOf: ctx.directorsOf };
  const names = await nameResolver(emailsIn([...myEvents, ...review, ...soon]));
  const o = { names, today: ctx.today, ctx: needs };

  const askRows: RowData[] = asks.map((a) => ({
    id: a.id,
    title: `${a.requesterName} asks for ${a.hold.room}`,
    href: `/events/${a.hold.cardId ?? a.fromCard}#asks`,
    sub: `${datesText(a.dates)} · held by ${a.hold.label} · “${a.reason}”`,
    status: SLOT_STATUS_LABEL[a.status],
    state: "act",
  }));

  const room = roomById(ctx.bookable, sp.room ?? "") ?? busiestRoom(agenda, ctx.rooms, ctx.bookable, date);
  const items = room ? roomDay(agenda, ctx.rooms, room, date) : [];

  return (
    <div className="stack loose">
      <ModuleHead
        title="Events & Rooms"
        lead="Request a program or event and book its room. Rooms are checked against the IAR calendar as you fill in the request."
        actions={<Button href="/events/new" variant="primary" icon="plus">New event request</Button>}
      />

      {askRows.length > 0 && <ItemList title="Asks for your booked time" rows={askRows} right={<span>{askRows.length} waiting</span>} />}

      {review.length > 0 && <ItemList title="Needs your review" rows={rowsFor(review, actor, o)} right={<span>{review.length} to review</span>} />}

      <ItemList
        title="Your requests"
        sections={sectionsOf(groupedRows(groupForViewer(myEvents, actor, needs), actor, o))}
        legend={myEvents.length > 0}
        empty="You haven't requested an event yet."
        emptyAction={<Button href="/events/new" variant="primary" size="small">New event request</Button>}
      />

      <ItemList title="Upcoming at IAR" rows={rowsFor(soon, actor, o)} right={<span>{soon.length}</span>} empty="Nothing else booked through the portal yet." />

      <Panel title="Room calendar" right="Pick a room and day to see what's booked">
        {room ? (
          <>
            <RoomDay options={ctx.bookable.map((r) => ({ id: r.id, name: r.name }))} value={room.id} date={date} today={ctx.today} />
            <Timeline items={items} caption={`${room.name} · ${dayText(date)}`} />
          </>
        ) : (
          <p className="note">No rooms are set up for booking yet. An admin turns rooms on in Portal Settings.</p>
        )}
      </Panel>
    </div>
  );
}
