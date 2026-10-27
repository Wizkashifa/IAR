import type { ReactNode } from "react";
import styles from "./Field.module.css";
import { Icon } from "./Icon";

/**
 * A form field: its label, the control, a hint and, when something's wrong,
 * the error right under the control. Wrap a native input, select or textarea,
 * or pass `htmlFor` with the control's id when the control isn't a direct child.
 * Give the control aria-describedby={errorId(id)} so screen readers read the error.
 */
export function Field({ label, hint, error, required, htmlFor, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; htmlFor?: string; children: ReactNode; className?: string }) {
  const cls = [styles.field, error ? styles.invalid : "", className].filter(Boolean).join(" ");
  const head = (
    <span className={styles.label}>
      {label}
      {required && <RequiredTag />}
    </span>
  );
  const foot = (
    <>
      {hint && <span className={styles.hint}>{hint}</span>}
      {error && (
        <span className={styles.error} id={htmlFor ? errorId(htmlFor) : undefined}>
          <Icon name="alert" />
          {error}
        </span>
      )}
    </>
  );
  if (htmlFor) {
    return (
      <div className={cls}>
        <label htmlFor={htmlFor}>{head}</label>
        {children}
        {foot}
      </div>
    );
  }
  return (
    <label className={cls}>
      {head}
      {children}
      {foot}
    </label>
  );
}

/**
 * The mark on a question that must be answered, the same on every form. The
 * control itself carries `required`, so screen readers already say so.
 */
export function RequiredTag() {
  return (
    <span className={styles.req} aria-hidden="true">
      Required
    </span>
  );
}

/** One line at the top of a form saying what the tag means. */
export function RequiredKey() {
  return (
    <p className={styles.key}>
      Questions marked <RequiredTag /> must be answered before you can send it.
    </p>
  );
}

/** The id Field gives an error message, for the control's aria-describedby. */
export const errorId = (controlId: string) => `${controlId}-error`;

/** The row of buttons at the end of a form. With `sticky`, it stays at the bottom of the screen on phones. */
export function FormActions({ children, sticky = true }: { children: ReactNode; sticky?: boolean }) {
  return <div className={[styles.actions, sticky && styles.sticky].filter(Boolean).join(" ")}>{children}</div>;
}
