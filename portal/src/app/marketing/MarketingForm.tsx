"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MARKETING_TYPES, NOTES_MAX, type MarketingField, type MarketingInput } from "@/lib/marketing/forms";
import type { MarketingKind } from "@/lib/marketing/types";
import { Button } from "@/components/Button";
import { DateField } from "@/components/DateField";
import { FileDrop } from "@/components/FileDrop";
import { FILE_ACCEPT, FILE_HINT, MAX_FILE_MB, MAX_PER_UPLOAD, asksForFiles } from "@/lib/marketing/files";
import { Field, FormActions } from "@/components/Field";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import type { FormState } from "./actions";
import styles from "./marketing.module.css";

export type MarketingFormProps = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  kind: MarketingKind;
  /** Committees and teams this person may request for. */
  committees: string[];
  initial?: MarketingInput;
  /** Marketing's open question: the form asks for an answer first. */
  question?: string;
  /** YYYY-MM-DD in Raleigh, the earliest date a date question accepts. */
  today: string;
  cancelHref: string;
  submitLabel: string;
  /**
   * New requests only: whether files can be uploaded (a marketing folder is set
   * in Portal Settings). Left out on the edit page, where files are added on
   * the request page instead.
   */
  uploads?: boolean;
};

/** One request type's questions, the committee, files or a Drive link, and comments. */
export default function MarketingForm({ action, kind, committees, initial, question, today, cancelHref, submitLabel, uploads }: MarketingFormProps) {
  const [state, formAction] = useActionState(action, { errors: [], n: 0 });
  const v = state.values ?? initial;
  const t = MARKETING_TYPES[kind];
  const choices = v?.committee && !committees.includes(v.committee) ? [v.committee, ...committees] : committees;

  return (
    // Keyed on each answer from the server, so the fields keep what was typed when something needs fixing.
    <form key={state.n} action={formAction} className={`stack loose ${styles.form}`}>
      <input type="hidden" name="kind" value={kind} />
      {state.errors.length > 0 && (
        <div role="alert" className={styles.errors}>
          <Note tone="bad">
            <strong>Please fix:</strong>
            <ul>
              {state.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Note>
        </div>
      )}

      {question !== undefined && (
        <Panel title="Marketing's question">
          <div className="stack">
            <p className="pre">{question}</p>
            <Field label="Your answer" required hint="You can also change the request below. It goes back to marketing's weekly review when you send it.">
              <textarea name="answer" rows={3} maxLength={2000} required />
            </Field>
          </div>
        </Panel>
      )}

      <Panel title={t.label}>
        <div className="grid">
          {t.fields.map((f) => (
            <Question key={f.key} f={f} value={v?.answers[f.key]} today={today} />
          ))}
        </div>
      </Panel>

      <Panel title="About the request">
        <div className="grid">
          <Field label="Requesting committee or team" required>
            <select name="committee" defaultValue={v?.committee ?? choices[0] ?? ""} required>
              {choices.length === 0 && <option value="">You&apos;re not on a committee or team yet</option>}
              {choices.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          {uploads && asksForFiles(kind) && (
            <div className="wide">
              <FileDrop
                name="files"
                label="Files for marketing (optional)"
                hint={`${FILE_HINT[kind] ?? ""} Up to ${MAX_PER_UPLOAD} files of ${MAX_FILE_MB} MB each; for more, use a Drive link.`}
                accept={FILE_ACCEPT}
                maxFiles={MAX_PER_UPLOAD}
                maxSizeMb={MAX_FILE_MB}
                camera={kind === "highlight" || kind === "badge" || kind === "signage"}
              />
            </div>
          )}
          <Field
            label="Google Drive link to files (optional)"
            hint={
              uploads === false && asksForFiles(kind)
                ? "File uploads aren't set up yet, so share your files with a Drive link. Share it with “Everyone at Islamic Association of Raleigh” so marketing can open it."
                : "For a folder or large files. Share it with “Everyone at Islamic Association of Raleigh” so marketing can open it."
            }
          >
            <input type="url" name="driveLink" defaultValue={v?.driveLink ?? ""} placeholder="https://drive.google.com/…" maxLength={500} />
          </Field>
          <Field label="Comments (optional)" className="wide">
            <textarea name="notes" rows={2} defaultValue={v?.notes ?? ""} maxLength={NOTES_MAX} />
          </Field>
        </div>
      </Panel>

      <FormActions>
        <Submit label={submitLabel} />
        <Button href={cancelHref}>Cancel</Button>
      </FormActions>
    </form>
  );
}

/** One of the type's questions. Half-width ones sit side by side; the rest take the full row. */
function Question({ f, value, today }: { f: MarketingField; value?: string; today: string }) {
  const name = `a_${f.key}`;
  const label = `${f.label}${f.required ? "" : " (optional)"}`;
  const legend = <>{label}{f.required && <span aria-hidden="true"> *</span>}</>;
  const wide = f.half || f.kind === "date" ? undefined : "wide";
  if (f.kind === "radio") {
    return (
      <fieldset className={[styles.group, "wide"].join(" ")}>
        <legend className={styles.groupLabel}>{legend}</legend>
        <div className={styles.choices}>
          {f.options?.map((o) => (
            <label key={o.value} className={styles.choice}>
              <input type="radio" name={name} value={o.value} defaultChecked={value === o.value} required={f.required} /> {o.label}
            </label>
          ))}
        </div>
        {f.hint && <p className="sub">{f.hint}</p>}
      </fieldset>
    );
  }
  if (f.kind === "date") {
    return <DateField name={name} label={f.label} hint={f.hint} required={f.required} defaultValue={value || null} min={today} />;
  }
  return (
    <Field label={label} hint={f.hint} required={f.required} className={wide}>
      {f.example && <span className={styles.example}>{f.example}</span>}
      {f.kind === "textarea" ? (
        <textarea name={name} rows={5} defaultValue={value ?? ""} placeholder={f.placeholder} required={f.required} maxLength={5000} />
      ) : (
        <input
          type={f.kind === "url" ? "url" : "text"}
          name={name}
          defaultValue={value ?? ""}
          placeholder={f.placeholder}
          required={f.required}
          maxLength={f.kind === "url" ? 500 : 200}
        />
      )}
    </Field>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Sending…" : label}
    </Button>
  );
}
