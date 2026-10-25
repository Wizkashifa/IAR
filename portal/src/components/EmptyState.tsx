import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";
import { Icon, type IconName } from "./Icon";

/** What a list or panel shows when there's nothing in it: a soft icon, one helpful sentence, and optionally the next step. */
export function EmptyState({ icon = "inbox", children, action }: { icon?: IconName; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <Icon name={icon} size="xl" />
      <p>{children}</p>
      {action}
    </div>
  );
}
