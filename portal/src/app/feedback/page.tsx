import Link from "next/link";
import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { ItemRow, Rows } from "@/components/ItemRow";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { FEEDBACK_KIND_LABEL, type Feedback, feedbackStore } from "@/lib/feedback";
import { internalPath } from "@/lib/links";
import { requireViewer } from "@/lib/viewer";
import { fmtDateTime } from "@/lib/format";
import { FeedbackForm } from "./FeedbackForm";
import styles from "./feedback.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Send feedback" };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string; ok?: string }> }) {
  const { from = "/", ok } = await searchParams;
  const page = internalPath(from) ?? "/";
  const viewer = await requireViewer();
  const admin = viewer.roles.includes("admins");
  const store = await feedbackStore();
  const [items, mine] = admin ? [await store.list(200), []] : [[], await store.listBy(viewer.email, 50)];
  const open = items.filter((f) => f.status === "new");

  return (
    <div className="stack">
      <ModuleHead title="Send feedback" lead="Tell us about anything broken, confusing or missing. It goes straight to the portal admins." />
      {ok ? (
        <Note tone="ok">
          Thank you, it&apos;s been sent. <Link href={page}>Back to where you were</Link>
        </Note>
      ) : (
        <Panel>
          <FeedbackForm page={page} />
        </Panel>
      )}

      {admin ? (
        <Panel title="Feedback received" right={<span>{open.length} open</span>} flush>
          <FeedbackRows items={items} who empty="Nothing yet." />
        </Panel>
      ) : (
        mine.length > 0 && (
          <Panel title="Your feedback" right={<span>{mine.length}</span>} flush>
            <FeedbackRows items={mine} empty="Nothing yet." />
          </Panel>
        )
      )}
    </div>
  );
}

/** Feedback as rows: each opens its own page, with the replies. `who` adds who sent it (for the admins' list). */
function FeedbackRows({ items, who, empty }: { items: Feedback[]; who?: boolean; empty: string }) {
  if (items.length === 0) return <EmptyState icon="message">{empty}</EmptyState>;
  return (
    <Rows>
      {items.map((f) => {
        const replies = f.replies?.length ?? 0;
        return (
          <ItemRow
            key={f.id}
            href={`/feedback/${encodeURIComponent(f.id)}`}
            title={<span className={styles.message}>{f.message}</span>}
            sub={[FEEDBACK_KIND_LABEL[f.kind], who && f.name, `on ${f.page}`, fmtDateTime(f.at), replies > 0 && `${replies} repl${replies === 1 ? "y" : "ies"}`].filter(Boolean).join(" · ")}
            status={f.status === "done" ? "Done" : "Open"}
            state={f.status === "done" ? "done" : f.kind === "problem" ? "bad" : "act"}
          />
        );
      })}
    </Rows>
  );
}
