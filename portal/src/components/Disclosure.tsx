import type { ReactNode } from "react";
import { buttonClass, type ButtonVariant } from "./Button";
import { Icon } from "./Icon";
import styles from "./Disclosure.module.css";

/**
 * Something folded away until asked for: "More", "Something wrong? Send it
 * back", "Mark done". By default the summary is a green link with a chevron;
 * `button` makes it look like a small button instead (a task's "Mark done");
 * with `full` it's a full-size button across the row (a phone card's step).
 * `divided` puts a line above it, under the main actions.
 */
export function Disclosure({ summary, open, button, full, divided, className, children }: { summary: ReactNode; open?: boolean; button?: ButtonVariant; full?: boolean; divided?: boolean; className?: string; children: ReactNode }) {
  const cls = [styles.d, button && styles.asButton, full && styles.full, divided && styles.divided, className].filter(Boolean).join(" ");
  return (
    <details className={cls} open={open}>
      {button ? (
        <summary className={buttonClass({ variant: button, size: full ? undefined : "small", full })}>{summary}</summary>
      ) : (
        <summary className={styles.link}>
          <Icon name="chevR" size="sm" className={styles.chev} />
          {summary}
        </summary>
      )}
      <div className={styles.body}>{children}</div>
    </details>
  );
}
