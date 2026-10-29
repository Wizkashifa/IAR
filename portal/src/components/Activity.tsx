import type { ReactNode } from "react";
import { type Comment, type Mention, mentionParts } from "@/lib/comments";
import { fmtDateTime } from "@/lib/format";
import type { NameOf } from "@/lib/steps";
import { initials, same } from "@/lib/text";
import type { HistoryEntry } from "@/lib/workflow-core";
import { CommentForm } from "./CommentForm";
import { Panel } from "./Panel";
import styles from "./Activity.module.css";

/** Who did it, in words: a name for an address, "Portal" for what the portal did by itself. */
const whoOf = (by: string, names: NameOf) => (by.includes("@") ? names(by) : by === "portal" ? "Portal" : by);

/** One line of activity: initials, the person's name, when, and what. */
function Act({ name, at, children }: { name: string; at: string; children: ReactNode }) {
  return (
    <li className={styles.act}>
      <span className={styles.av} aria-hidden="true">
        {initials(name)}
      </span>
      <div className={styles.ab}>
        <div>
          <strong>{name}</strong> <span className={styles.when}>{fmtDateTime(at)}</span>
        </div>
        {children}
      </div>
    </li>
  );
}

/** A comment's words, with the people it names picked out (more so the person reading). */
function CommentText({ c, me }: { c: Comment; me?: string }) {
  return (
    <div className="pre">
      {mentionParts(c.text, c.mentions).map((p, i) =>
        p.mention ? (
          <span key={i} className={me && same(p.mention.email, me) ? `${styles.mention} ${styles.mentionMe}` : styles.mention}>
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </div>
  );
}

/**
 * Comments on a request, as on every request page in the demo: the box to
 * add one, then the comments, newest first. `action` is the module's
 * comment action (lib/card-actions.ts `commentOnCard`). `people` can be
 * named with @ (lib/mentions.ts); `me` is who's reading.
 */
export function CommentsPanel({ id, comments, names, action, noun = "request", replies, people, me }: { id: string; comments?: Comment[]; names: NameOf; action: (form: FormData) => Promise<void>; noun?: string; replies?: string[]; people?: Mention[]; me?: string }) {
  const list = [...(comments ?? [])].reverse();
  return (
    <Panel title="Comments" right={String(list.length)} id="comments">
      <div className="stack">
        <CommentForm id={id} action={action} noun={noun} replies={replies} people={people?.filter((p) => !same(p.email, me))} />
        {list.length === 0 ? (
          <p className={styles.quiet}>No comments yet.</p>
        ) : (
          <ul className={styles.acts}>
            {list.map((c) => (
              <Act key={c.id} name={c.name || names(c.by)} at={c.at}>
                <CommentText c={c} me={me} />
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
            <Act key={i} name={whoOf(h.by, names)} at={h.at}>
              <div>{h.action}</div>
              {h.note && <div className={`${styles.note} pre`}>{h.note}</div>}
            </Act>
          ))}
        </ul>
      )}
    </Panel>
  );
}
