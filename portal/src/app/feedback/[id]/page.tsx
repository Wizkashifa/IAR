import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommentsPanel } from "@/components/Activity";
import { Button } from "@/components/Button";
import { Crumb } from "@/components/Crumb";
import { FlashNote } from "@/components/FlashNote";
import { KeyValue } from "@/components/KeyValue";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { FEEDBACK_KIND_LABEL, feedbackStore } from "@/lib/feedback";
import { mayOpenFeedback } from "@/lib/feedback-thread";
import { fmtDateTime } from "@/lib/format";
import { internalPath } from "@/lib/links";
import { nameResolver } from "@/lib/names";
import { requireViewer } from "@/lib/viewer";
import { replyToFeedback, setFeedbackStatus } from "../actions";
import styles from "../feedback.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Feedback" };

const MESSAGES: Record<string, string> = { replied: "Reply sent.", done: "Marked done.", new: "Reopened." };

/** One piece of feedback and the replies on it: for the portal admins and the person who sent it. */
export default async function FeedbackItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, sp, viewer] = await Promise.all([params, searchParams, requireViewer()]);
  const f = await (await feedbackStore()).get(decodeURIComponent(id));
  if (!f || !mayOpenFeedback(f, viewer)) notFound();
  const admin = viewer.roles.includes("admins");
  const mine = f.by === viewer.email.toLowerCase();
  const names = await nameResolver([f.by, ...(f.replies ?? []).map((r) => r.by)]);

  return (
    <>
      <Crumb trail={[{ href: "/feedback", label: "Feedback" }]} here={FEEDBACK_KIND_LABEL[f.kind]} />
      <ModuleHead
        title={mine ? "Your feedback" : `Feedback from ${f.name}`}
        lead={admin ? "Reply here and they hear about it in the portal and in Google Chat." : "The portal admins reply here, and you hear about it in the portal and in Google Chat."}
        actions={
          admin && (
            <form action={setFeedbackStatus}>
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="status" value={f.status === "new" ? "done" : "new"} />
              <input type="hidden" name="back" value="item" />
              <Button type="submit">{f.status === "new" ? "Mark done" : "Reopen"}</Button>
            </form>
          )
        }
      />
      <div className="stack">
        <FlashNote ok={sp.ok} error={sp.error} messages={MESSAGES} />
        <Panel title={FEEDBACK_KIND_LABEL[f.kind]} right={<Pill tone={f.status === "done" ? "ok" : "warn"} dot>{f.status === "done" ? "Done" : "Open"}</Pill>}>
          <div className="stack">
            <p className={styles.message}>{f.message}</p>
            <KeyValue
              items={[
                { label: "From", value: `${f.name} (${f.by})` },
                { label: "Page", value: internalPath(f.page) ? <Link href={f.page}>{f.page}</Link> : f.page },
                { label: "Sent", value: fmtDateTime(f.at) },
                { label: "Done by", value: f.status === "done" && f.doneBy ? names(f.doneBy) : null },
                { label: "Browser", value: admin ? f.userAgent : null },
              ]}
            />
          </div>
        </Panel>
        <CommentsPanel id={f.id} comments={f.replies} names={names} action={replyToFeedback} noun="feedback" />
      </div>
    </>
  );
}
