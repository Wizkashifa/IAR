import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

/**
 * What a list or panel shows when there's nothing in it: a small gold lantern,
 * an optional title in the greeting's serif ("All caught up"), one helpful
 * sentence, and optionally the next step.
 */
export function EmptyState({ title, children, action }: { title?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <svg className={styles.art} viewBox="0 0 48 64" aria-hidden="true">
        <path d="M24 2v5M19 7h10M17 13l3-6h8l3 6M14 13h20M14 13c-3 8-3 26 0 34h20c3-8 3-26 0-34M19 40V27a5 5 0 0 1 10 0v13zM12 47h24M17 47l2 7h10l2-7M22 54v4h4v-4" />
      </svg>
      {title && <p className={styles.title}>{title}</p>}
      <p>{children}</p>
      {action}
    </div>
  );
}
