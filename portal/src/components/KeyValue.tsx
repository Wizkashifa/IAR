import { Fragment, type ReactNode } from "react";
import styles from "./KeyValue.module.css";

export type KeyValueItem = { label: ReactNode; value: ReactNode };

/** Labels and values, as in every details box. Empty values are skipped. `stacked` puts each label above its value. */
export function KeyValue({ items, stacked }: { items: KeyValueItem[]; stacked?: boolean }) {
  const shown = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== false && i.value !== "");
  return (
    <dl className={[styles.kv, stacked && styles.stacked].filter(Boolean).join(" ")}>
      {shown.map((i, n) => (
        <Fragment key={n}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
