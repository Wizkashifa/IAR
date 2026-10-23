import { STATUS_LABEL, type CardStatus } from "@/lib/cards";
import { COMMENT_MAX, type Comment } from "@/lib/comments";

/** Shared formatting and pieces every request page uses. Times are shown in Raleigh time. */

export const fmtMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
export const fmtMonth = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
/** "Tue, Nov 4, 2026" for a "YYYY-MM-DD" day. */
export const fmtDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
/** "6:30 PM" for "18:30". */
export const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

export function StatusPill({ status, label }: { status: CardStatus; label?: string }) {
  return <span className={`pill ${status}`}>{label ?? STATUS_LABEL[status]}</span>;
}

/** A success note from `?ok=` (looked up in `messages`) or an error from `?error=`. */
export function Flash({ ok, error, messages }: { ok?: string; error?: string; messages: Record<string, string> }) {
  if (error) return <div className="error" role="alert">{error}</div>;
  if (ok && messages[ok]) return <div className="flash" role="status">{messages[ok]}</div>;
  return null;
}

/** A request's history, newest first. */
export function HistoryList({ entries }: { entries: { at: string; by: string; action: string; note?: string }[] }) {
  return (
    <ol className="history">
      {[...entries].reverse().map((h, i) => (
        <li key={i}>
          <div><strong>{h.action}</strong></div>
          <div className="sub">{h.by} · {fmtDateTime(h.at)}</div>
          {h.note && <div className="hnote pre">{h.note}</div>}
        </li>
      ))}
    </ol>
  );
}

/** Comments on a request and a box to add one. `action` is the module's server action; it gets `id` and `text`. */
export function CommentsSection({ id, comments, action }: { id: string; comments?: Comment[]; action: (form: FormData) => Promise<void> }) {
  return (
    <>
      <h2 id="comments">Comments</h2>
      {(comments ?? []).length === 0 ? (
        <p className="note">No comments yet. Ask a question or add context; everyone who can open this request sees it.</p>
      ) : (
        <ol className="history">
          {(comments ?? []).map((c) => (
            <li key={c.id}>
              <div><strong>{c.name}</strong> <span className="sub">{fmtDateTime(c.at)}</span></div>
              <div className="hnote pre">{c.text}</div>
            </li>
          ))}
        </ol>
      )}
      <form action={action} className="stack">
        <input type="hidden" name="id" value={id} />
        <label className="field">
          <span>Add a comment</span>
          <textarea name="text" rows={3} maxLength={COMMENT_MAX} required />
        </label>
        <div>
          <button className="button secondary" type="submit">Comment</button>
        </div>
      </form>
    </>
  );
}
