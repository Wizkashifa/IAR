import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/lib/viewer";
import { findModule } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: id } = await params;
  const viewer = await requireViewer();
  const mod = findModule(id);
  // A module someone can't see looks the same as one that doesn't exist.
  if (!mod || !mod.visibleTo.some((r) => viewer.roles.includes(r))) notFound();
  if (mod.status === "live" && mod.href !== `/m/${id}`) redirect(mod.href);

  return (
    <>
      <h1>{mod.name}</h1>
      <p className="lead">{mod.summary}</p>
      <div className="panel">
        <span className={`pill ${mod.status}`}>{mod.status === "building" ? "In development" : `Planned for phase ${mod.phase}`}</span>
        <p>This module isn&apos;t open yet. What it will do:</p>
        <ul>
          {mod.plannedFeatures.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
