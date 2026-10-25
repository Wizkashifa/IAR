import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Chips } from "@/components/Chips";
import { ItemRow, Rows } from "@/components/ItemRow";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { todayLocal } from "@/lib/dates";
import { policiesLibrary, searchPolicies } from "@/lib/library";
import { reviewState, type LibraryFile } from "@/lib/library-core";
import { requireViewer } from "@/lib/viewer";
import { fmtDate } from "@/lib/format";
import styles from "./library.module.css";
import { SearchForm } from "@/components/SearchForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library" };

/**
 * The Library, policies first: IAR's Policies Shared Drive, listed read-only.
 * Pick a folder or search; every file opens in Google Drive, which checks
 * access. The portal keeps no copies.
 */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; folder?: string }> }) {
  const { q: rawQ = "", folder = "" } = await searchParams;
  const q = rawQ.trim().slice(0, 100);
  const viewer = await requireViewer();
  const admin = viewer.actingRoles.includes("admins");
  const listed = await policiesLibrary();

  const head = <ModuleHead title="Library" lead="IAR's approved policies, straight from the Policies Shared Drive. Files open in Google Drive." />;

  if (listed.state === "unset")
    return (
      <div className="stack">
        {head}
        <Panel>
          <EmptyState icon="folder" action={admin ? <Button href="/admin#library">Connect the Policies drive</Button> : undefined}>
            The Policies drive isn&apos;t connected yet. {admin ? "Add it in Portal Settings." : "A portal admin connects it in Portal Settings."}
          </EmptyState>
        </Panel>
      </div>
    );
  if (listed.state === "error")
    return (
      <div className="stack">
        {head}
        <Note tone="bad">The portal couldn&apos;t reach Google Drive just now, so the Library can&apos;t be shown. Try again in a few minutes. The admins have been told.</Note>
      </div>
    );

  const { files, folders } = listed.library;
  const today = todayLocal();
  const found = q ? await searchPolicies(q) : null;
  const shown = found ?? (folder ? files.filter((f) => f.folderId === folder) : files);
  const folderName = folders.find((f) => f.id === folder)?.name;
  const due = files.filter((f) => f.reviewBy && reviewState(f.reviewBy, today).tone !== "neutral" && f.folder !== "Archive").length;
  const title = q ? `Results for “${q}”` : folderName ?? "All policies";

  return (
    <div className="stack">
      {head}
      <SearchForm action="/library" label="Search the Library" value={q} placeholder="Search policies by name or by words inside them" />
      {!q && folders.length > 0 && (
        <Chips label="Folders" chips={[{ label: "All folders", href: "/library", on: !folder }, ...folders.map((f) => ({ label: f.name, href: `/library?folder=${encodeURIComponent(f.id)}`, on: f.id === folder, count: f.count }))]} />
      )}
      {admin && due > 0 && !q && !folder && (
        <Note tone="warn">
          {due} {due === 1 ? "policy is" : "policies are"} due for review in the next 30 days or overdue. Set a file&apos;s review date in Google Drive by writing &ldquo;Review by 2027-01-31&rdquo; in its description.
        </Note>
      )}
      <Panel title={title} right={<span>{shown.length} {shown.length === 1 ? "file" : "files"}</span>} flush>
        {shown.length === 0 ? (
          <EmptyState icon="search" action={q ? <Button href="/library">Show all policies</Button> : undefined}>
            {q ? `No policy matches “${q}”.` : "This folder is empty."}
          </EmptyState>
        ) : (
          <Rows>
            {shown.map((f) => (
              <FileRow key={f.id} file={f} today={today} showFolder={!folder || Boolean(q)} />
            ))}
          </Rows>
        )}
      </Panel>
      <p className={styles.foot}>
        Only what&apos;s in IAR&apos;s Policies drive shows here. To change a policy, open it in Drive; the Shura and executive can edit, everyone at IAR can read.
      </p>
    </div>
  );
}

function FileRow({ file: f, today, showFolder }: { file: LibraryFile; today: string; showFolder: boolean }) {
  const review = f.reviewBy && f.folder !== "Archive" ? reviewState(f.reviewBy, today) : null;
  const sub = [f.kind.label, showFolder && f.folder, f.updated && `updated ${fmtDate(f.updated)}${f.updatedBy ? ` by ${f.updatedBy}` : ""}`].filter(Boolean).join(" · ");
  return (
    <ItemRow
      state="plain"
      icon={f.kind.icon}
      title={f.name}
      href={f.url}
      external="Google Drive"
      sub={sub}
      right={
        review && (
          <Pill tone={review.tone} dot={review.tone !== "neutral"}>
            {review.label}
          </Pill>
        )
      }
    />
  );
}
