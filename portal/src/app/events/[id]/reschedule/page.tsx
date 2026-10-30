import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Crumb } from "@/components/Crumb";
import { ModuleHead } from "@/components/ModuleHead";
import { cardStore } from "@/lib/cards";
import { eventActor, eventContext } from "@/lib/events/context";
import { editPermission, timeOf } from "@/lib/events/reschedule";
import { ruleOn } from "@/lib/events/rules";
import { isEventCard } from "@/lib/events/workflow";
import { requireViewer } from "@/lib/viewer";
import { rescheduleEvent } from "../../actions";
import TimeForm from "../../TimeForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Change date or time" };

export default async function RescheduleEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();
  const card = await (await cardStore()).get(id);
  if (!isEventCard(card) || card.ownerEmail !== viewer.email.toLowerCase()) notFound();
  const ctx = await eventContext();
  const p = editPermission(card, eventActor(viewer), ctx.today, ruleOn(ctx.rules, "lead"));
  if (!p.ok) redirect(`/events/${id}?error=${encodeURIComponent(p.reason)}`);
  const approved = card.status === "approved";
  return (
    <div className="stack loose">
      <div className="stack tight">
        <Crumb trail={[{ href: "/events", label: "Events & Rooms" }, { href: `/events/${id}`, label: id }]} here="Change date or time" />
        <ModuleHead accent="events" title="Change date or time" lead={card.title} />
      </div>
      <TimeForm action={rescheduleEvent.bind(null, id)} id={id} expected={card.updatedAt} initial={timeOf(card.event)} dateLocked={p.dateLocked ? p.lockReason : undefined} approved={approved} series={Boolean(card.event.recur)} today={ctx.today} />
    </div>
  );
}
