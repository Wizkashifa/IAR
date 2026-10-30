import { ModuleHead } from "@/components/ModuleHead";
import { requireViewer } from "@/lib/viewer";
import { locationChoices } from "@/lib/tickets/locations";
import { googleRooms } from "@/lib/rooms-google";
import { createTicket } from "../actions";
import TicketForm from "../TicketForm";
import { Crumb } from "@/components/Crumb";

export const dynamic = "force-dynamic";
export const metadata = { title: "Report a problem" };

export default async function NewTicket() {
  await requireViewer();
  return (
    <div className="stack">
      <Crumb trail={[{ href: "/it-maintenance", label: "IT & Maintenance" }]} />
      <ModuleHead accent="it"
        title="Report a problem"
        lead="Something broken or needed in the building, IT or A/V. It goes to the maintenance or IT team. You'll be notified when someone picks it up and when it's fixed."
      />
      <TicketForm action={createTicket} locations={locationChoices((await googleRooms()).map((r) => r.name))} />
    </div>
  );
}
