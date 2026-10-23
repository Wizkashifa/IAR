import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { locationChoices } from "@/lib/tickets/locations";
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
      <h1>Report a problem</h1>
      <p className="lead">It goes to the facilities or IT team. You&apos;ll hear when someone picks it up and when it&apos;s fixed, and you can follow it in My Requests.</p>
      <TicketForm action={createTicket} locations={locationChoices()} />
    </>
  );
}
