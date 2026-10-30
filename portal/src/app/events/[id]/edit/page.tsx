import { VERB } from "@/lib/glossary";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { eventActor, eventContext } from "@/lib/events/context";
import { isEventCard, permission } from "@/lib/events/workflow";
import { submitEvent } from "../../actions";
import { Crumb } from "@/components/Crumb";
import EventForm from "../../EventForm";
import { formProps } from "../../form-props";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Make the changes and send it again" };

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();
  const card = await (await cardStore()).get(id);
  if (!isEventCard(card) || card.ownerEmail !== viewer.email.toLowerCase()) notFound();
  if (!permission(card, eventActor(viewer), "resubmit").ok) redirect(`/events/${id}`);
  const ctx = await eventContext();
  const props = await formProps(viewer, ctx, { group: card.event.committeeGroup, name: card.event.committeeName });
  const moved = Boolean(card.event.releasedFor);
  return (
    <div className="stack loose">
      <div className="stack tight">
        <Crumb trail={[{ href: "/events", label: "Events & Rooms" }, { href: `/events/${id}`, label: id }]} here={moved ? "New time" : "Edit"} />
        <ModuleHead accent="events" title={moved ? "Pick a new time" : VERB.makeChanges} lead={card.title} />
      </div>
      {card.event.returnNote && !moved && (
        <Note tone="warn">
          <strong>What to change:</strong> {card.event.returnNote}
        </Note>
      )}
      <EventForm action={submitEvent.bind(null, id)} {...props} initial={card.event} editing={id} moved={moved} submitLabel={VERB.sendAgain} />
    </div>
  );
}
