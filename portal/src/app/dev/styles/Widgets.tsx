"use client";

import { Panel } from "@/components/Panel";
import { Button } from "@/components/Button";
import { DateField, TimeField } from "@/components/DateField";
import { RoomPicker } from "@/components/RoomPicker";
import { PeoplePicker } from "@/components/PeoplePicker";
import { FileDrop } from "@/components/FileDrop";
import { ConfirmButton } from "@/components/Confirm";
import { toast } from "@/components/toast";

const ROOMS = [
  { id: "mphAB", name: "MPH A&B – full gym", capacity: 150 },
  { id: "mphA", name: "MPH A – half gym", capacity: 75 },
  { id: "cafe", name: "Al-Maidah Cafe", capacity: 50 },
  { id: "r240", name: "Room 240 – conference room", capacity: 30 },
  { id: "flex", name: "Community Flex Room", capacity: 40 },
];
const PEOPLE = [
  { email: "chair@dev.local", name: "Sample Chair", note: "Youth chair" },
  { email: "vice@dev.local", name: "Sample Vice Chair" },
  { email: "facilities@dev.local", name: "Sample Facilities", note: "Facility Maintenance" },
];

/** The Mantine-based pieces, shown on /dev/styles. They live in a client component because they're interactive. */
export function Widgets() {
  return (
    <Panel title="Pickers, uploads and confirmations" right="Mantine, through our wrappers">
      <form className="stack" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); toast(`Would send: ${[...f.entries()].map(([k, v]) => `${k}=${v instanceof File ? v.name : v}`).join(", ")}`, { tone: "info" }); }}>
        <div className="grid">
          <DateField name="date" label="Date" defaultValue="2026-11-21" required />
          <TimeField name="start" label="Event starts" defaultValue="18:30" />
          <RoomPicker name="rooms" rooms={ROOMS} usedMost={["mphAB", "cafe"]} defaultValue={["mphAB"]} hint="Leave empty for an off-site event." />
          <PeoplePicker name="assignee" label="Assign to" people={PEOPLE} />
        </div>
        <FileDrop name="receipts" label="Receipts" hint="Photos or PDFs." accept={["image/*", "application/pdf"]} camera />
        <div className="row">
          <Button type="submit" variant="primary">Try sending</Button>
          <Button onClick={() => toast("Saved.")}>Show a toast</Button>
          <Button onClick={() => toast("Marked as held.", { undo: () => toast("Undone.", { tone: "info" }) })}>Toast with Undo</Button>
          <ConfirmButton variant="danger" title="Withdraw this request?" message="The room hold is released and the teams are told." confirmLabel="Withdraw" name="action" value="withdraw">
            Withdraw…
          </ConfirmButton>
        </div>
      </form>
    </Panel>
  );
}
