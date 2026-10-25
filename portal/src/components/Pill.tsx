import type { ReactNode } from "react";
import styles from "./Pill.module.css";

/**
 * The four meanings colour has in the portal: ok (done, approved), warn (you
 * need to act), bad (stopped, late), info (waiting on someone else). accent is
 * the brand green; neutral is for counts and labels.
 */
export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "accent";

/** A small rounded label, usually a status. `dot` adds the coloured dot the demo uses on statuses. */
export function Pill({ tone = "neutral", dot, children, title }: { tone?: Tone; dot?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={[styles.pill, tone !== "neutral" && styles[tone], dot && styles.dot].filter(Boolean).join(" ")} title={title}>
      {children}
    </span>
  );
}
