import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { committeesFor, eventContext } from "@/lib/events/context";
import { submitEvent } from "../actions";
import EventForm from "../EventForm";

export const dynamic = "force-dynamic";

export default async function NewEvent() {
  const viewer = await requireViewer();
  const ctx = await eventContext();
  const committees = committeesFor(viewer, ctx.dir);
  return (
    <>
      <p className="crumb">
        <Link href="/events">Events &amp; Rooms</Link>
      </p>
      <h1>New event request</h1>
      <p className="lead">The room, approval, marketing and A/V in one request. The checks run against the IAR room calendars as you fill it in.</p>
      {committees.length === 0 ? (
        <div className="panel empty">You can request events for the committees and teams you&apos;re on. You aren&apos;t on one yet; ask your committee&apos;s chair to add you to its group.</div>
      ) : (
        <EventForm
          action={submitEvent.bind(null, null)}
          committees={committees}
          rooms={ctx.bookable.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, building: r.building, food: r.food }))}
          today={ctx.today}
          submitLabel="Submit request"
        />
      )}
    </>
  );
}
