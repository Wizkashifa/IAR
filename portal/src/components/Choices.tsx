import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Choices.module.css";
import { RequiredTag } from "./Field";

/**
 * A question answered by picking: a fieldset with its legend and the
 * choices, as cards (the default) or a plain list. `legendHidden` keeps the
 * legend for screen readers when a panel title already asks the question.
 * `stacked` puts one choice per row. `required` shows the Required tag.
 */
export function Choices({ legend, legendHidden, plain, stacked, required, hint, children, className }: { legend: ReactNode; legendHidden?: boolean; plain?: boolean; stacked?: boolean; required?: boolean; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={[styles.group, plain && styles.plain, stacked && styles.stacked, className].filter(Boolean).join(" ")}>
      <legend className={legendHidden ? "sr-only" : styles.legend}>
        {legend}
        {required && !legendHidden && <RequiredTag />}
      </legend>
      <div className={styles.list}>{children}</div>
      {hint && <p className={styles.hint}>{hint}</p>}
    </fieldset>
  );
}

/** One radio button or checkbox with its label and an optional line under it. Takes any input attribute (name, value, checked, onChange…). */
export function Choice({ label, hint, ...input }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { type: "radio" | "checkbox"; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={styles.choice}>
      <input {...input} />
      <span className={styles.text}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

/** A plain tick box with its label (no card): "I confirm…", "Show sub-accounts from every fund". `quiet` for a small grey one in a panel header. */
export function Checkbox({ children, quiet, ...input }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { children: ReactNode; quiet?: boolean }) {
  return (
    <label className={quiet ? `${styles.tick} ${styles.quiet}` : styles.tick}>
      <input type="checkbox" {...input} />
      <span>{children}</span>
    </label>
  );
}
