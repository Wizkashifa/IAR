import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { committeesFor, eventActor, eventContext } from "@/lib/events/context";
import { isEventCard, permission } from "@/lib/events/workflow";
import { submitEvent } from "../../actions";
import EventForm from "../../EventForm";

export const dynamic = "force-dynamic";

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();
  const card = await (await cardStore()).get(id);
  if (!isEventCard(card) || card.ownerEmail !== viewer.email.toLowerCase()) notFound();
  if (!permission(card, eventActor(viewer), "resubmit").ok) redirect(`/events/${id}`);
  const ctx = await eventContext();
  const committees = committeesFor(viewer, ctx.dir);
  if (!committees.some((c) => c.group === card.event.committeeGroup)) committees.unshift({ group: card.event.committeeGroup, name: card.event.committeeName });
  return (
    <>
      <p className="crumb">
        <Link href="/events">Events &amp; Rooms</Link> / <Link href={`/events/${id}`}>{id}</Link>
      </p>
      <h1>Update and resubmit</h1>
      {card.event.returnNote && !card.event.releasedFor && <div className="callout warn"><strong>What to change:</strong> {card.event.returnNote}</div>}
      <EventForm
        action={submitEvent.bind(null, id)}
        committees={committees}
        rooms={ctx.bookable.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, building: r.building, food: r.food }))}
        initial={card.event}
        editing={id}
        moved={Boolean(card.event.releasedFor)}
        today={ctx.today}
        submitLabel="Resubmit"
      />
    </>
  );
}
