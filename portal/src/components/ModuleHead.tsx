import type { ReactNode } from "react";
import styles from "./ModuleHead.module.css";

/**
 * The top of every module page: its name, one line on what it's for, and the
 * buttons to start something (usually one primary). On a phone the buttons
 * drop under the title.
 */
export function ModuleHead({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={styles.head}>
      <div className={styles.text}>
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
