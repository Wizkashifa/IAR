import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./LinkCard.module.css";

/** A card that opens something: an icon, a title and a line about it (the marketing request types, the help guides). Put several in `LinkCards`. */
export function LinkCard({ href, icon, title, children }: { href: string; icon: IconName; title: ReactNode; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className={styles.card}>
        <span className={styles.icon} aria-hidden="true">
          <Icon name={icon} />
        </span>
        <span>
          <span className={styles.title}>{title}</span>
          <span className={styles.text}>{children}</span>
        </span>
      </Link>
    </li>
  );
}

/** A grid of LinkCards. */
export function LinkCards({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className={styles.grid} aria-label={label}>
      {children}
    </ul>
  );
}
