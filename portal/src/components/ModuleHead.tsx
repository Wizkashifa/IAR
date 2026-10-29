import type { ReactNode } from "react";
import type { Accent } from "@/lib/modules";
import { IconTile } from "./Icon";
import styles from "./ModuleHead.module.css";

/**
 * The top of every page: a cream band with IAR's pattern fading in from the
 * right, the page's name, one line on what it's for, and the buttons to start
 * something (one primary). On a phone the buttons drop under the title.
 * `greet` sets the title in the home greeting's serif. A module's pages pass
 * its `accent`: the band takes the module's tint, with its icon tile.
 */
export function ModuleHead({ title, lead, actions, greet, accent }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode; greet?: boolean; accent?: Accent }) {
  return (
    <header className={styles.head} data-mod={accent}>
      {accent && <IconTile accent={accent} size={56} tone="solid" className={styles.tile} />}
      <div className={styles.text}>
        <h1 className={greet ? "greet" : undefined}>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
