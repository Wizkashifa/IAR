import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ItemRow } from "@/components/ItemRow";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { FEEDBACK_KIND_LABEL, feedbackStore } from "@/lib/feedback";
import { internalPath } from "@/lib/links";
import { requireViewer } from "@/lib/viewer";
import { fmtDateTime } from "@/lib/format";
import { FeedbackForm } from "./FeedbackForm";
import { setFeedbackStatus } from "./actions";
import styles from "./feedback.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Send feedback" };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string; ok?: string }> }) {
  const { from = "/", ok } = await searchParams;
  const page = internalPath(from) ?? "/";
  const viewer = await requireViewer();
  const admin = viewer.roles.includes("admins");
  const items = admin ? await (await feedbackStore()).list(200) : [];
  const open = items.filter((f) => f.status === "new");

  return (
    <div className="stack">
      <ModuleHead title="Send feedback" lead="The portal is in beta. Tell us about anything broken, confusing or missing. It goes straight to the portal admins." />
      {ok ? (
        <Note tone="ok">
          Thank you, it&apos;s been sent. <Link href={page}>Back to where you were</Link>
        </Note>
      ) : (
        <Panel>
          <FeedbackForm page={page} />
        </Panel>
      )}

      {admin && (
        <Panel title="Feedback received" right={<span>{open.length} open</span>} flush>
          {items.length === 0 ? (
            <EmptyState icon="message">Nothing yet.</EmptyState>
          ) : (
            <ul className={styles.list}>
              {items.map((f) => (
                <ItemRow
                  key={f.id}
                  title={<span className={styles.message}>{f.message}</span>}
                  sub={
                    <>
                      {FEEDBACK_KIND_LABEL[f.kind]} · {f.name} · on {internalPath(f.page) ? <Link href={f.page}>{f.page}</Link> : f.page} · {fmtDateTime(f.at)}
                    </>
                  }
                  state={f.status === "done" ? "done" : f.kind === "problem" ? "bad" : "act"}
                  right={
                    <form action={setFeedbackStatus} className={styles.status}>
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="status" value={f.status === "new" ? "done" : "new"} />
                      <Pill tone={f.status === "done" ? "ok" : "warn"} dot>
                        {f.status === "done" ? "Done" : "Open"}
                      </Pill>
                      <Button type="submit" size="small" variant="quiet">
                        {f.status === "new" ? "Mark done" : "Reopen"}
                      </Button>
                    </form>
                  }
                />
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
