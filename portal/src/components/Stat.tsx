import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Stat.module.css";

export type StatTone = "plain" | "ok" | "warn" | "bad";

/** One headline number: a label, the number, and a line under it. With `href` the whole tile opens that page. Put several in `Stats`. */
export function Stat({ label, value, note, href, tone = "plain" }: { label: string; value: ReactNode; note?: ReactNode; href?: string; tone?: StatTone }) {
  const inner = (
    <>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${tone !== "plain" ? styles[tone] : ""}`}>{value}</span>
      {note && <span className={styles.note}>{note}</span>}
    </>
  );
  return <li>{href ? <Link href={href} className={`${styles.stat} ${styles.link}`}>{inner}</Link> : <div className={styles.stat}>{inner}</div>}</li>;
}

/** A row of Stat tiles that wraps on narrow screens. */
export function Stats({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className={styles.grid} aria-label={label}>
      {children}
    </ul>
  );
}
