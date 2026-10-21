import Link from "next/link";
import { FEEDBACK_KIND_LABEL, feedbackStore } from "@/lib/feedback";
import { internalPath } from "@/lib/links";
import { requireViewer } from "@/lib/viewer";
import { fmtDateTime } from "../purchases/ui";
import { FeedbackForm } from "./FeedbackForm";
import { setFeedbackStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string; ok?: string }> }) {
  const { from = "/", ok } = await searchParams;
  const page = internalPath(from) ?? "/";
  const viewer = await requireViewer();
  const admin = viewer.roles.includes("admins");
  const items = admin ? await (await feedbackStore()).list(200) : [];
  const open = items.filter((f) => f.status === "new");

  return (
    <>
      <h1>Send feedback</h1>
      <p className="lead">The portal is in beta. Tell us about anything broken, confusing or missing. It goes straight to the portal admins.</p>
      {ok ? (
        <div className="flash" role="status">
          Thank you, it&apos;s been sent. <Link href={page}>Back to where you were</Link>
        </div>
      ) : (
        <FeedbackForm page={page} />
      )}

      {admin && (
        <>
          <h2>Feedback received ({open.length} open)</h2>
          {items.length === 0 ? (
            <div className="panel empty">Nothing yet.</div>
          ) : (
            <div className="tablewrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Feedback</th>
                    <th>From</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <span className={`tag ${f.kind === "problem" ? "warn" : "info"}`}>{FEEDBACK_KIND_LABEL[f.kind]}</span>
                        <div className="pre" style={{ marginTop: 4 }}>{f.message}</div>
                        <div className="sub">
                          On {internalPath(f.page) ? <Link href={f.page}>{f.page}</Link> : f.page} · {fmtDateTime(f.at)}
                          {f.userAgent && <> · {f.userAgent}</>}
                        </div>
                      </td>
                      <td>{f.name}<div className="sub">{f.by}</div></td>
                      <td>
                        <form action={setFeedbackStatus}>
                          <input type="hidden" name="id" value={f.id} />
                          <input type="hidden" name="status" value={f.status === "new" ? "done" : "new"} />
                          <span className={`pill ${f.status === "done" ? "closed" : "in_review"}`}>{f.status === "done" ? "Done" : "Open"}</span>{" "}
                          <button className="linkbtn" type="submit">{f.status === "new" ? "Mark done" : "Reopen"}</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
