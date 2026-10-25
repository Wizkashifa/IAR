"use client";

import { usePathname } from "next/navigation";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import styles from "./AppNavStates.module.css";

/** Placeholder panels while a page loads (app/loading.tsx). */
export function PageLoading() {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className={`${styles.bar} ${styles.title}`} />
      <div className={`${styles.bar} ${styles.lead}`} />
      {[0, 1].map((i) => (
        <div key={i} className={styles.panel}>
          <div className={`${styles.bar} ${styles.head}`} />
          {[0, 1, 2].map((j) => (
            <div key={j} className={styles.row}>
              <div className={`${styles.bar} ${styles.line}`} />
              <div className={`${styles.bar} ${styles.short}`} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** When a page fails (app/error.tsx): say so plainly, offer to try again, and make it easy to tell us. */
export function PageError({ retry, digest }: { retry: () => void; digest?: string }) {
  const path = usePathname();
  return (
    <div className={styles.error}>
      <h1>Something went wrong</h1>
      <EmptyState
        icon="alert"
        action={
          <div className="row">
            <Button variant="primary" onClick={retry}>
              Try again
            </Button>
            <Button href={`/feedback?from=${encodeURIComponent(path)}`}>Tell us what happened</Button>
          </div>
        }
      >
        This page didn&apos;t load. Try again, and if it keeps happening, tell us what you were doing.
        {digest && <span className={styles.ref}>Reference: {digest}</span>}
      </EmptyState>
    </div>
  );
}
