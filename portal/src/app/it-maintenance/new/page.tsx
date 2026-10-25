import Link from "next/link";
import { ModuleHead } from "@/components/ModuleHead";
import { requireViewer } from "@/lib/viewer";
import { locationChoices } from "@/lib/tickets/locations";
import { googleRooms } from "@/lib/rooms-google";
import { createTicket } from "../actions";
import TicketForm from "../TicketForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "AV/IT/Maintenance" };

export default async function NewTicket() {
  await requireViewer();
  return (
    <div className="stack">
      <nav className="crumb" aria-label="Breadcrumb">
        <Link href="/it-maintenance">IT &amp; Maintenance</Link>
      </nav>
      <ModuleHead
        title="AV/IT/Maintenance"
        lead="Something broken or something you need: it goes to the maintenance or IT team. You'll hear when someone picks it up and when it's done, and you can follow it in My Requests."
      />
      <TicketForm action={createTicket} locations={locationChoices((await googleRooms()).map((r) => r.name))} />
    </div>
  );
}
