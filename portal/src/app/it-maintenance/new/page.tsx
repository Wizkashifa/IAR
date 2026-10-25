import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { locationChoices } from "@/lib/tickets/locations";
import { googleRooms } from "@/lib/rooms-google";
import { createTicket } from "../actions";
import TicketForm from "../TicketForm";

export const dynamic = "force-dynamic";

export default async function NewTicket() {
  await requireViewer();
  return (
    <>
      <p className="crumb">
        <Link href="/it-maintenance">IT &amp; Maintenance</Link>
      </p>
      <h1>AV/IT/Maintenance request</h1>
      <p className="lead">Something broken or something you need: it goes to the maintenance or IT team. You&apos;ll hear when someone picks it up and when it&apos;s done, and you can follow it in My Requests.</p>
      <TicketForm action={createTicket} locations={locationChoices((await googleRooms()).map((r) => r.name))} />
    </>
  );
}
