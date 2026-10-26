import type { ReactNode } from "react";
import styles from "./Panel.module.css";

/**
 * A white card. With a `title`, it gets the demo's header row: the title on
 * the left and a count or action (`right`) on the right. `flush` drops the body
 * padding for lists that run edge to edge.
 */
export function Panel({ title, right, level = 2, flush, children, id, className }: { title?: ReactNode; right?: ReactNode; level?: 2 | 3; flush?: boolean; children: ReactNode; id?: string; className?: string }) {
  const H = level === 3 ? "h3" : "h2";
  return (
    <section className={[styles.panel, className].filter(Boolean).join(" ")} id={id}>
      {(title || right) && (
        <div className={styles.head}>
          {title ? <H>{title}</H> : <span />}
          {right && <div className={styles.right}>{right}</div>}
        </div>
      )}
      <div className={flush ? styles.flush : styles.body}>{children}</div>
    </section>
  );
}

/** A small grey line under a panel's list or table ("Spent so far…", "From the 34 most recent requests"). */
export function PanelFoot({ children }: { children: ReactNode }) {
  return <div className={styles.foot}>{children}</div>;
}

/** A small grey line above a panel's list, saying what's in it or who can see it. */
export function PanelNote({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}
