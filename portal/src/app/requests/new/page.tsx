import type { Metadata } from "next";
import { Crumb } from "@/components/Crumb";
import { EmptyState } from "@/components/EmptyState";
import { NewRequestTiles } from "@/components/LinkCard";
import { ModuleHead } from "@/components/ModuleHead";
import { KINDS } from "@/lib/kinds";
import { visibleModules } from "@/lib/modules";
import { requireViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New request" };

/** Pick what to ask for: one tile per kind of request this person can send (the same list as My Requests). */
export default async function NewRequest() {
  const viewer = await requireViewer();
  const live = new Set(visibleModules(viewer.roles).filter((m) => m.status === "live").map((m) => m.id));
  const kinds = KINDS.filter((k) => live.has(k.module));
  return (
    <div className="stack">
      <Crumb trail={[{ href: "/requests", label: "My Requests" }]} here="New request" />
      <ModuleHead title="New request" lead="What do you need? Pick one to start." />
      {kinds.length > 0 ? <NewRequestTiles kinds={kinds} /> : <EmptyState>There&apos;s nothing you can ask for here yet.</EmptyState>}
    </div>
  );
}
