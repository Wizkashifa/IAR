import { EmptyState } from "@/components/EmptyState";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { requireViewer } from "@/lib/viewer";
import { ticketActor } from "@/lib/tickets/context";
import { canImportJira } from "@/lib/tickets/workflow";
import { jiraImport } from "../actions";
import ImportForm from "./ImportForm";
import { Crumb } from "@/components/Crumb";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import from Jira" };

export default async function ImportPage() {
  const viewer = await requireViewer();
  const allowed = canImportJira(ticketActor(viewer));
  return (
    <div className="stack">
      <Crumb trail={[{ href: "/it-maintenance", label: "IT & Maintenance" }]} />
      <ModuleHead accent="it"
        title="Import from Jira"
        lead="Bring the facilities team's open Jira issues over once, so everything is in one place and the people who reported them can follow along. Importing the same file again is safe: issues already brought over are skipped."
      />
      {allowed ? (
        <ImportForm action={jiraImport} />
      ) : (
        <Panel flush>
          <EmptyState>Only portal admins and the Facility Maintenance team&apos;s chairs can import from Jira.</EmptyState>
        </Panel>
      )}
    </div>
  );
}
