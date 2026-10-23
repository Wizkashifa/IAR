"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MARKETING_TYPES, NOTES_MAX, type MarketingField, type MarketingInput } from "@/lib/marketing/forms";
import type { MarketingKind } from "@/lib/marketing/types";
import type { FormState } from "./actions";

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
};

/** One request type's questions, the committee, a Drive link and comments. */
export default function MarketingForm({ action, kind, committees, initial, question, today, cancelHref, submitLabel }: MarketingFormProps) {
  const [state, formAction] = useActionState(action, { errors: [], n: 0 });
  const v = state.values ?? initial;
  const t = MARKETING_TYPES[kind];
  const choices = v?.committee && !committees.includes(v.committee) ? [v.committee, ...committees] : committees;

  return (
    // Keyed on each answer from the server, so the fields keep what was typed when something needs fixing.
    <form key={state.n} action={formAction} className="form">
      <input type="hidden" name="kind" value={kind} />
      {state.errors.length > 0 && (
        <div className="error" role="alert">
          <strong>Please fix:</strong>
          <ul>
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {question !== undefined && (
        <fieldset className="section">
          <legend>Marketing&apos;s question</legend>
          <p className="pre">{question}</p>
          <label className="field">
            <span>Your answer</span>
            <textarea name="answer" rows={3} maxLength={2000} required />
          </label>
          <p className="note">You can also change the request below. It goes back to marketing&apos;s weekly review when you send it.</p>
        </fieldset>
      )}

      <fieldset className="section">
        <legend>{t.label}</legend>
        <div className="stack">
          {groupHalves(t.fields).map((g) =>
            g.length === 2 ? (
              <div className="grid2" key={g[0].key}>
                {g.map((f) => <Field key={f.key} f={f} value={v?.answers[f.key]} today={today} />)}
              </div>
            ) : (
              <Field key={g[0].key} f={g[0]} value={v?.answers[g[0].key]} today={today} />
            ),
          )}
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>About the request</legend>
        <div className="stack">
          <label className="field">
            <span>Requesting committee or team</span>
            <select name="committee" defaultValue={v?.committee ?? choices[0] ?? ""} required>
              {choices.length === 0 && <option value="">You&apos;re not on a committee or team yet</option>}
              {choices.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Google Drive link to files (optional)</span>
            <input type="url" name="driveLink" defaultValue={v?.driveLink ?? ""} placeholder="https://drive.google.com/…" maxLength={500} />
            <small>Share it with “Everyone at Islamic Association of Raleigh”.</small>
          </label>
          <label className="field">
            <span>Comments (optional)</span>
            <textarea name="notes" rows={2} defaultValue={v?.notes ?? ""} maxLength={NOTES_MAX} />
          </label>
        </div>
      </fieldset>

      <div className="row">
        <Submit label={submitLabel} />
        <Link href={cancelHref} className="button secondary">Cancel</Link>
      </div>
    </form>
  );
}

/** Half-width questions pair up side by side. */
function groupHalves(fields: MarketingField[]): MarketingField[][] {
  const out: MarketingField[][] = [];
  for (const f of fields) {
    const last = out.at(-1);
    if (f.half && last?.length === 1 && last[0].half) last.push(f);
    else out.push([f]);
  }
  return out;
}

function Field({ f, value, today }: { f: MarketingField; value?: string; today: string }) {
  const name = `a_${f.key}`;
  const label = `${f.label}${f.required ? "" : " (optional)"}`;
  if (f.kind === "radio") {
    return (
      <fieldset className="field mk-group">
        <span>{label}</span>
        <div className="choices">
          {f.options?.map((o) => (
            <label key={o.value} className="choice">
              <input type="radio" name={name} value={o.value} defaultChecked={value === o.value} required={f.required} /> {o.label}
            </label>
          ))}
        </div>
        {f.hint && <small>{f.hint}</small>}
      </fieldset>
    );
  }
  return (
    <label className="field">
      <span>{label}</span>
      {f.example && <small className="mk-example">{f.example}</small>}
      {f.kind === "textarea" ? (
        <textarea name={name} rows={5} defaultValue={value ?? ""} placeholder={f.placeholder} required={f.required} maxLength={5000} />
      ) : (
        <input
          type={f.kind === "date" ? "date" : f.kind === "url" ? "url" : "text"}
          name={name}
          defaultValue={value ?? ""}
          placeholder={f.placeholder}
          required={f.required}
          min={f.kind === "date" ? today : undefined}
          maxLength={f.kind === "url" ? 500 : f.kind === "text" ? 200 : undefined}
        />
      )}
      {f.hint && <small>{f.hint}</small>}
    </label>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending}>
      {pending ? "Sending…" : label}
    </button>
  );
}
