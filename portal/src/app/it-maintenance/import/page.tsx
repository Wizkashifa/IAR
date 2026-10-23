import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { ticketActor } from "@/lib/tickets/context";
import { canImportJira } from "@/lib/tickets/workflow";
import { jiraImport } from "../actions";
import ImportForm from "./ImportForm";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const viewer = await requireViewer();
  const allowed = canImportJira(ticketActor(viewer));
  return (
    <>
      <p className="crumb">
        <Link href="/it-maintenance">IT &amp; Maintenance</Link>
      </p>
      <h1>Import from Jira</h1>
      <p className="lead">Bring the facilities team&apos;s open Jira issues over once, so everything is in one place and the people who reported them can follow along. Importing the same file again is safe: issues already brought over are skipped.</p>
      {allowed ? <ImportForm action={jiraImport} /> : <div className="panel empty">Only portal admins and the Facility Maintenance team&apos;s chairs can import from Jira.</div>}
    </>
  );
}
