import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { requireViewer } from "@/lib/viewer";
import { eventContext } from "@/lib/events/context";
import { submitEvent } from "../actions";
import EventForm from "../EventForm";
import { formProps } from "../form-props";
import { Crumb } from "../Crumb";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New event request" };

export default async function NewEvent() {
  const viewer = await requireViewer();
  const ctx = await eventContext();
  const props = await formProps(viewer, ctx);
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
        <EventForm action={submitEvent.bind(null, null)} {...props} submitLabel="Send request" />
      )}
    </div>
  );
}
