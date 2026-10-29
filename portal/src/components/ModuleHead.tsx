import type { ReactNode } from "react";
import styles from "./ModuleHead.module.css";

/**
 * The top of every page: a cream band with IAR's pattern fading in from the
 * right, the page's name, one line on what it's for, and the buttons to start
 * something (one primary). On a phone the buttons drop under the title.
 * `greet` sets the title in the home greeting's serif.
 */
export function ModuleHead({ title, lead, actions, greet }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode; greet?: boolean }) {
  return (
    <header className={styles.head}>
      <div className={styles.text}>
        <h1 className={greet ? "greet" : undefined}>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
