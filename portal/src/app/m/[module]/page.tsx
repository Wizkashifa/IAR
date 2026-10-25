import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { findModule } from "@/lib/modules";
import { requireViewer } from "@/lib/viewer";
import styles from "./module.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  const { module: id } = await params;
  return { title: findModule(id)?.name ?? "Not available" };
}

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: id } = await params;
  const viewer = await requireViewer();
  const mod = findModule(id);
  // A module someone can't see looks the same as one that doesn't exist.
  if (!mod || !mod.visibleTo.some((r) => viewer.roles.includes(r))) notFound();
  if (mod.status === "live" && mod.href !== `/m/${id}`) redirect(mod.href);

  return (
    <div className="stack">
      <ModuleHead title={mod.name} lead={mod.summary} />
      <Panel title="Not open yet" right={<Pill tone="info">{mod.status === "building" ? "Being built" : "Planned"}</Pill>}>
        <p className={styles.intro}>This part of the portal isn&apos;t open yet. What it will do:</p>
        <ul className={styles.features}>
          {mod.plannedFeatures.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
