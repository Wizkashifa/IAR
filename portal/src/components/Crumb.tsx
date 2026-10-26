import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Crumb.module.css";

/** "Events & Rooms / EV-1101 / Edit": where this page sits, above its title. */
export function Crumb({ trail, here }: { trail: { href: string; label: string }[]; here?: ReactNode }) {
  return (
    <nav className={styles.crumb} aria-label="Breadcrumb">
      {trail.map((t, i) => (
        <span key={t.href}>
          <Link href={t.href}>{t.label}</Link>
          {(here || i < trail.length - 1) && <span aria-hidden="true"> / </span>}
        </span>
      ))}
      {here && <span>{here}</span>}
    </nav>
  );
}
