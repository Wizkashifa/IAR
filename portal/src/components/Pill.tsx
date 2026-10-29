import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./Pill.module.css";

/**
 * The four meanings colour has in the portal: ok (done, approved), warn (you
 * need to act), bad (stopped, late), info (waiting on someone else). accent is
 * the brand green; gold marks today; neutral is for counts and labels.
 */
export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "accent" | "gold";

/** Each meaning's icon, so a status never relies on colour alone. */
const TONE_ICON: Partial<Record<Tone, IconName>> = { warn: "triangle", info: "clock", ok: "check", bad: "ban" };

/**
 * A small rounded label. `status` makes it a status pill: taller, bold, with
 * its tone's icon (a dot for tones without one); `small` is for a tag beside a
 * heading ("Today", "3 new").
 */
export function Pill({ tone = "neutral", status, small, children, title }: { tone?: Tone; status?: boolean; small?: boolean; children: ReactNode; title?: string }) {
  const icon = status ? TONE_ICON[tone] : undefined;
  return (
    <span className={[styles.pill, tone !== "neutral" && styles[tone], status && styles.status, status && !icon && styles.dot, small && styles.small].filter(Boolean).join(" ")} title={title}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </span>
  );
}
