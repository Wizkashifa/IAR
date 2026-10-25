import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { canRequestAgain, copiedNote, eventAgain } from "@/lib/again";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { readPrefill } from "@/lib/calendar-view";
import { eventContext } from "@/lib/events/context";
import { isEventCard } from "@/lib/events/workflow";
import { submitEvent } from "../actions";
import EventForm from "../EventForm";
import { formProps } from "../form-props";
import { Crumb } from "../Crumb";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New event request" };

type Query = { from?: string; date?: string; start?: string; end?: string; room?: string; people?: string; food?: string };

export default async function NewEvent({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const viewer = await requireViewer();
  const ctx = await eventContext();
  const props = await formProps(viewer, ctx);
  // "Request this again": start from a past event this person asked for or chairs.
  const source = query.from ? await (await cardStore()).get(query.from) : null;
  const copy = isEventCard(source) && canRequestAgain(source, viewer, ctx.today) ? eventAgain(source.event, ctx.today) : undefined;
  if (copy && !props.committees.some((c) => c.group === copy.committeeGroup)) {
    const c = props.committees.find((x) => x.group === props.defaultCommittee) ?? props.committees[0];
    copy.committeeGroup = c?.group ?? "";
    copy.committeeName = c?.name ?? "";
  }
  // From "Find a room" on the Calendar: start on that date, time, room and size (a copy wins if both are given).
  const prefill = copy ? undefined : readPrefill(query, ctx.bookable.map((r) => r.id), ctx.today);
  return (
    <div className="stack loose">
      <div className="stack tight">
        <Crumb trail={[{ href: "/events", label: "Events & Rooms" }]} here="New request" />
        <ModuleHead title="New event request" lead="The room, approval, marketing and A/V in one request. The checks run against the IAR room calendars as you fill it in." />
      </div>
      {props.committees.length === 0 ? (
        <Panel>
          <EmptyState icon="calendar" action={<Button href="/events">Back to Events &amp; Rooms</Button>}>
            You can request events for the committees and teams you&apos;re on. You aren&apos;t on one yet; ask your committee&apos;s chair to add you to its group.
          </EmptyState>
        </Panel>
      ) : (
        <>
          {copy && source && <Note tone="info">{copiedNote(source.id)}</Note>}
          <EventForm action={submitEvent.bind(null, null)} {...props} initial={copy} prefill={prefill} submitLabel="Send request" />
        </>
      )}
    </div>
  );
}
