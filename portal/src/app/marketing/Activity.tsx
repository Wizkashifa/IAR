import type { Comment } from "@/lib/comments";
import { COMMENT_MAX } from "@/lib/comments";
import type { HistoryEntry } from "@/lib/marketing/types";
import type { NameOf } from "@/lib/next-step";
import { Button } from "@/components/Button";
import { Panel } from "@/components/Panel";
import { fmtDateTime } from "../ui";
import styles from "./marketing.module.css";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** One line of activity: initials, the person's name, what happened and when. */
function Act({ name, when, children }: { name: string; when: string; children: React.ReactNode }) {
  return (
    <li className={styles.act}>
      <span className={styles.av} aria-hidden="true">
        {initials(name)}
      </span>
      <div className={styles.ab}>
        <div>
          <strong>{name}</strong> <span className={styles.when}>{fmtDateTime(when)}</span>
        </div>
        {children}
      </div>
    </li>
  );
}

/** Comments on the request, newest first, with the box to add one. */
export function CommentsPanel({ id, comments, names, action }: { id: string; comments?: Comment[]; names: NameOf; action: (form: FormData) => Promise<void> }) {
  const list = [...(comments ?? [])].reverse();
  return (
    <Panel title={`Comments${list.length ? ` (${list.length})` : ""}`} id="comments">
      <div className="stack">
        <form action={action} className="stack">
          <input type="hidden" name="id" value={id} />
          <textarea name="text" rows={3} maxLength={COMMENT_MAX} required aria-label="Comment" placeholder="Ask a question or add context. Everyone who can open this request sees it." />
          <div className="row end">
            <Button type="submit" variant="primary" size="small">
              Comment
            </Button>
          </div>
        </form>
        {list.length === 0 ? (
          <p className={styles.quiet}>No comments yet.</p>
        ) : (
          <ul className={styles.acts}>
            {list.map((c) => (
              <Act key={c.id} name={c.name || names(c.by)} when={c.at}>
                <div className="pre">{c.text}</div>
              </Act>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/** What happened to the request, newest first. */
export function HistoryPanel({ entries, names }: { entries: HistoryEntry[]; names: NameOf }) {
  return (
    <Panel title="History">
      {entries.length === 0 ? (
        <p className={styles.quiet}>Nothing yet.</p>
      ) : (
        <ul className={styles.acts}>
          {[...entries].reverse().map((h, i) => (
            <Act key={i} name={names(h.by)} when={h.at}>
              <div>{h.action}</div>
              {h.note && <div className={`${styles.hnote} pre`}>{h.note}</div>}
            </Act>
          ))}
        </ul>
      )}
    </Panel>
  );
}
