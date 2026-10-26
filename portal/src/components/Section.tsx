import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Section.module.css";

/**
 * A page section that folds under its heading: click the heading to open or
 * close it. For long settings pages (Portal Settings), so the headings read
 * like a table of contents. Closed unless `open`.
 */
export function Section({ title, id, open, children }: { title: ReactNode; id?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className={styles.s} id={id} open={open}>
      <summary className={styles.head}>
        <Icon name="chevR" size="sm" className={styles.chev} />
        <h2>{title}</h2>
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}
