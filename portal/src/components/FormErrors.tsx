import { Note } from "./Note";
import styles from "./FormErrors.module.css";

/** What a form's server action returns when something needs fixing. */
export type FormState = { errors: string[] };

/** What to fix before sending a form again, at the top of the form. Nothing when there's nothing to fix. */
export function FormErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <Note tone="bad">
      {errors.length === 1 ? (
        errors[0]
      ) : (
        <>
          Please fix these, then send it again:
          <ul className={styles.list}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </>
      )}
    </Note>
  );
}
