import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Tabs.module.css";

/** One tab: a plain link, so the server picks what to show. `extra` sits after the label (a "3 new" pill). */
export type Tab = { label: string; href: string; on?: boolean; extra?: ReactNode };

/**
 * Tabs across the top of a module page ("Your requests" and the team's work),
 * with the team's other pages as quiet links at the end. `label` names the row
 * for screen readers.
 */
export function Tabs({ tabs, label, links = [] }: { tabs: Tab[]; label: string; links?: { label: string; href: string }[] }) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={t.on ? `${styles.tab} ${styles.on}` : styles.tab} aria-current={t.on ? "page" : undefined}>
          {t.label}
          {t.extra}
        </Link>
      ))}
      {links.length > 0 && <span className={styles.spacer} />}
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={styles.quiet}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
