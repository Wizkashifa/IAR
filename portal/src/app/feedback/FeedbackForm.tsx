"use client";
import { useActionState } from "react";
import { Button } from "@/components/Button";
import { Field, FormActions } from "@/components/Field";
import { FEEDBACK_KIND_LABEL, type FeedbackKind } from "@/lib/feedback-kinds";
import { sendFeedback } from "./actions";
import { FormErrors, type FormState } from "@/components/FormErrors";
import { Choice, Choices } from "@/components/Choices";

export function FeedbackForm({ page }: { page: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(sendFeedback, { errors: [] });
  return (
    <form action={action} className="stack">
      <FormErrors errors={state.errors} />
      <input type="hidden" name="page" value={page} />
      <Choices legend="What kind of feedback?">
        {(Object.keys(FEEDBACK_KIND_LABEL) as FeedbackKind[]).map((k, i) => (
          <Choice key={k} type="radio" name="kind" value={k} defaultChecked={i === 0} label={FEEDBACK_KIND_LABEL[k]} />
        ))}
      </Choices>
      <Field
        label="What happened, or what would help?"
        hint="The portal team sees the page you came from. Don't include card numbers or tax IDs."
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
