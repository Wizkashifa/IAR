"use client";
import { useActionState } from "react";
import { Button } from "@/components/Button";
import { Field, FormActions } from "@/components/Field";
import { Note } from "@/components/Note";
import { FEEDBACK_KIND_LABEL, type FeedbackKind } from "@/lib/feedback-kinds";
import { sendFeedback, type FeedbackFormState } from "./actions";
import styles from "./feedback.module.css";

export function FeedbackForm({ page }: { page: string }) {
  const [state, action, pending] = useActionState<FeedbackFormState, FormData>(sendFeedback, { errors: [] });
  return (
    <form action={action} className="stack">
      {state.errors.length > 0 && <Note tone="bad">{state.errors.join(" ")}</Note>}
      <input type="hidden" name="page" value={page} />
      <fieldset className={styles.kinds}>
        <legend>What kind of feedback?</legend>
        {(Object.keys(FEEDBACK_KIND_LABEL) as FeedbackKind[]).map((k, i) => (
          <label key={k} className={styles.kind}>
            <input type="radio" name="kind" value={k} defaultChecked={i === 0} /> {FEEDBACK_KIND_LABEL[k]}
          </label>
        ))}
      </fieldset>
      <Field
        label="What happened, or what would help?"
        hint={`We'll see the page you came from (${page}) and your browser. Please don't include card numbers or tax IDs.`}
        required
      >
        <textarea name="message" rows={6} maxLength={4000} required placeholder="What you were trying to do, what you expected, and what happened instead." />
      </Field>
      <FormActions>
        <Button type="submit" variant="primary" disabled={pending} icon="message">
          Send feedback
        </Button>
      </FormActions>
    </form>
  );
}
