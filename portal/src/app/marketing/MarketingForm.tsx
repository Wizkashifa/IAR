"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FormStarted } from "@/components/FormStarted";
import { MARKETING_TYPES, NOTES_MAX, asksForNotes, type MarketingField, type MarketingInput } from "@/lib/marketing/forms";
import type { MarketingKind } from "@/lib/marketing/types";
import { Button } from "@/components/Button";
import { DateField } from "@/components/DateField";
import { FileDrop } from "@/components/FileDrop";
import { DRIVE_NOTE, FILE_ACCEPT, FILE_HINT, MAX_FILE_MB, MAX_PER_UPLOAD, asksForFiles } from "@/lib/marketing/files";
import { Field, FormActions, RequiredKey } from "@/components/Field";
import { Panel } from "@/components/Panel";
import type { MarketingFormState } from "./actions";
import styles from "./marketing.module.css";
import { FormErrors } from "@/components/FormErrors";
import { Choice, Choices } from "@/components/Choices";

export type MarketingFormProps = {
  action: (prev: MarketingFormState, form: FormData) => Promise<MarketingFormState>;
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
   * New requests only: whether files can be uploaded (go-live has made the
   * Marketing Files drive). Left out on the edit page, where files are added on
   * the request page instead.
   */
  uploads?: boolean;
};

/** The committee and one request type's questions, then files or a Drive link for the types that use them. */
export default function MarketingForm({ action, kind, committees, initial, question, today, cancelHref, submitLabel, uploads }: MarketingFormProps) {
  const [state, formAction] = useActionState(action, { errors: [], n: 0 });
  const v = state.values ?? initial;
  const t = MARKETING_TYPES[kind];
  const choices = v?.committee && !committees.includes(v.committee) ? [v.committee, ...committees] : committees;
  // Types that start from the requester's own material get a Files section: uploads, or a Drive link for more.
  const files = asksForFiles(kind);
  const driveHint = [
    uploads === false && files ? "File uploads aren't set up yet, so share your files with a Drive link." : files && uploads ? "For more files, or bigger ones." : "",
    "Share it with “Everyone at Islamic Association of Raleigh” so marketing can open it.",
    DRIVE_NOTE[kind] ?? "",
  ].filter(Boolean).join(" ");

  return (
    // Keyed on each answer from the server, so the fields keep what was typed when something needs fixing.
    <form key={state.n} action={formAction} className={`stack loose ${styles.form}`}>
      <input type="hidden" name="kind" value={kind} />
      <FormStarted form="marketing" />
      <FormErrors errors={state.errors} />
      <RequiredKey />

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

      <Panel title="The request">
        <div className="grid">
          <Field label="Requesting committee or team" required>
            <select name="committee" defaultValue={v?.committee ?? choices[0] ?? ""} required>
              {choices.length === 0 && <option value="">You&apos;re not on a committee or team yet</option>}
              {choices.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          {t.fields.map((f) => (
            <Question key={f.key} f={f} value={v?.answers[f.key]} today={today} />
          ))}
          {(asksForNotes(kind) || v?.notes) && (
            <Field label="Comments (optional)" className="wide">
              <textarea name="notes" rows={2} defaultValue={v?.notes ?? ""} maxLength={NOTES_MAX} />
            </Field>
          )}
        </div>
      </Panel>

      {(files || v?.driveLink) && (
        <Panel title="Files">
          <div className="grid">
            {files && uploads && (
              <div className="wide">
                <FileDrop
                  name="files"
                  label="Files for marketing (optional)"
                  hint={`${FILE_HINT[kind] ?? ""} Up to ${MAX_PER_UPLOAD} files of ${MAX_FILE_MB} MB each.`}
                  accept={FILE_ACCEPT}
                  maxFiles={MAX_PER_UPLOAD}
                  maxSizeMb={MAX_FILE_MB}
                  camera={kind === "highlight" || kind === "badge" || kind === "signage"}
                />
              </div>
            )}
            <Field label={files && uploads ? "Or share a Google Drive folder (optional)" : "Google Drive link to files (optional)"} hint={driveHint} className="wide">
              <input type="url" name="driveLink" defaultValue={v?.driveLink ?? ""} placeholder="https://drive.google.com/…" maxLength={500} />
            </Field>
          </div>
        </Panel>
      )}

      <FormActions>
        <Button href={cancelHref}>Cancel</Button>
        <Submit label={submitLabel} />
      </FormActions>
    </form>
  );
}

/** One of the type's questions. Half-width ones sit side by side; the rest take the full row. */
function Question({ f, value, today }: { f: MarketingField; value?: string; today: string }) {
  const name = `a_${f.key}`;
  const label = `${f.label}${f.required ? "" : " (optional)"}`;
  const wide = f.half || f.kind === "date" ? undefined : "wide";
  if (f.kind === "radio") {
    return (
      <Choices legend={label} required={f.required} plain hint={f.hint} className="wide">
        {f.options?.map((o) => (
          <Choice key={o.value} type="radio" name={name} value={o.value} defaultChecked={value === o.value} required={f.required} label={o.label} />
        ))}
      </Choices>
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
