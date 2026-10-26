import type { ReactNode } from "react";
import styles from "./DataTable.module.css";

/**
 * A table of staff data (line items, vendors, settings, measures). Put it in
 * a flush Panel, or pass `framed` when it stands on its own. On a phone,
 * a table whose cells have `data-label` turns each row into a small card
 * labelled from it; `compact` (line items) shows what it was on the left and
 * the amount on the right instead. Pass `caption` to name it for screen readers.
 */
export function DataTable({ children, compact, framed, caption }: { children: ReactNode; compact?: boolean; framed?: boolean; caption?: string }) {
  return (
    <div className={framed ? `${styles.wrap} ${styles.framed}` : styles.wrap}>
      <table className={compact ? `${styles.table} ${styles.compact}` : styles.table}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

/** Cell styles: `num` for amounts and counts (right-aligned), `sub` for a grey second line, `nowrap`, `date` (a line item's date). */
export const cell = { num: styles.num, sub: styles.sub, nowrap: styles.nowrap, date: styles.date };
