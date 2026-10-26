import type { ReactNode } from "react";
import styles from "./Pill.module.css";

/**
 * The four meanings colour has in the portal: ok (done, approved), warn (you
 * need to act), bad (stopped, late), info (waiting on someone else). accent is
 * the brand green; gold marks today; neutral is for counts and labels.
 */
export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "accent" | "gold";

/** A small rounded label, usually a status. `dot` adds the coloured dot the demo uses on statuses; `small` is for a tag beside a heading ("Today", "3 new"). */
export function Pill({ tone = "neutral", dot, small, children, title }: { tone?: Tone; dot?: boolean; small?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={[styles.pill, tone !== "neutral" && styles[tone], dot && styles.dot, small && styles.small].filter(Boolean).join(" ")} title={title}>
      {children}
    </span>
  );
}
