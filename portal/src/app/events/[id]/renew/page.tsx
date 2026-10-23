import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { committeesFor, eventContext } from "@/lib/events/context";
import { nextPeriod, renewalState } from "@/lib/events/renewal";
import { isEventCard } from "@/lib/events/workflow";
import { submitEvent } from "../../actions";
import EventForm from "../../EventForm";

export const dynamic = "force-dynamic";

/** Request the next period of a repeating event: the same details, the next dates. */
export default async function RenewEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();
  const store = await cardStore();
  const card = await store.get(id);
  if (!isEventCard(card) || !card.event.recur) notFound();
  const ctx = await eventContext();
  const next = card.event.renewedBy ? await store.get(card.event.renewedBy) : null;
  const state = renewalState(card, { email: viewer.email, office: viewer.actingRoles.includes("office") }, ctx.today, isEventCard(next) ? next : null);
  if (!state.can) redirect(`/events/${id}?error=${encodeURIComponent(state.why)}`);
  const committees = committeesFor(viewer, ctx.dir);
  if (!committees.some((c) => c.group === card.event.committeeGroup)) committees.unshift({ group: card.event.committeeGroup, name: card.event.committeeName });
  const period = nextPeriod(card.event.date, card.event.recur);
  return (
    <>
      <p className="crumb">
        <Link href="/events">Events &amp; Rooms</Link> / <Link href={`/events/${id}`}>{id}</Link>
      </p>
      <h1>Renew a repeating event</h1>
      <EventForm
        action={submitEvent.bind(null, null)}
        committees={committees}
        rooms={ctx.bookable.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, building: r.building, food: r.food }))}
        initial={{ ...card.event, ...period }}
        renews={{ id, until: card.event.recur.until }}
        today={ctx.today}
        submitLabel="Request the next period"
      />
    </>
  );
}
