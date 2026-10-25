import Link from "next/link";
import styles from "./events.module.css";

/** "Events & Rooms / EV-1101 / Edit": where this page sits, as on the request page. */
export function Crumb({ trail, here }: { trail: { href: string; label: string }[]; here: string }) {
  return (
    <nav className={styles.crumb} aria-label="Breadcrumb">
      {trail.map((t) => (
        <span key={t.href}>
          <Link href={t.href}>{t.label}</Link>
          <span aria-hidden="true"> / </span>
        </span>
      ))}
      <span>{here}</span>
    </nav>
  );
}
