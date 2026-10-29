import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ModuleHead } from "@/components/ModuleHead";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { eventContext } from "@/lib/events/context";
import { nextPeriod, renewalState } from "@/lib/events/renewal";
import { isEventCard } from "@/lib/events/workflow";
import { submitEvent } from "../../actions";
import { Crumb } from "@/components/Crumb";
import EventForm from "../../EventForm";
import { formProps } from "../../form-props";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Renew a repeating event" };

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
  const props = await formProps(viewer, ctx, { group: card.event.committeeGroup, name: card.event.committeeName });
  const period = nextPeriod(card.event.date, card.event.recur);
  return (
    <div className="stack loose">
      <div className="stack tight">
        <Crumb trail={[{ href: "/events", label: "Events & Rooms" }, { href: `/events/${id}`, label: id }]} here="Renew" />
        <ModuleHead accent="events" title="Renew a repeating event" lead={card.title} />
      </div>
      <EventForm action={submitEvent.bind(null, null)} {...props} initial={{ ...card.event, ...period }} renews={{ id, until: card.event.recur.until }} submitLabel="Request the next period" />
    </div>
  );
}
