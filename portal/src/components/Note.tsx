import type { ReactNode } from "react";
import styles from "./Note.module.css";
import { Icon, type IconName } from "./Icon";

const ICON: Record<NoteTone, IconName> = { info: "info", warn: "alert", ok: "check", bad: "alert" };
export type NoteTone = "info" | "warn" | "ok" | "bad";

/** A tinted note in one of the four tones. Errors and confirmations are announced to screen readers. */
export function Note({ tone = "info", children, icon = true }: { tone?: NoteTone; children: ReactNode; icon?: boolean }) {
  const role = tone === "bad" ? "alert" : tone === "ok" ? "status" : undefined;
  return (
    <div className={`${styles.note} ${styles[tone]}`} role={role}>
      {icon && <Icon name={ICON[tone]} />}
      <div>{children}</div>
    </div>
  );
}
