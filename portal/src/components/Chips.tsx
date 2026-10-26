import Link from "next/link";
import styles from "./Chips.module.css";

/** A filter chip that's a plain link (?kind=…), so the server does the filtering. `count` shows after the label. */
export type Chip = { label: string; href: string; on?: boolean; count?: number };

/** A row of filter chips, as in the demo. `label` names the row for screen readers ("Show", "Team"). */
export function Chips({ chips, label }: { chips: Chip[]; label: string }) {
  return (
    <nav className={styles.chips} aria-label={label}>
      {chips.map((c) => (
        <Link key={c.href} href={c.href} className={c.on ? `${styles.chip} ${styles.on}` : styles.chip} aria-current={c.on ? "page" : undefined}>
          {c.label}
          {c.count !== undefined && <span className={styles.n}>{c.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
