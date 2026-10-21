"use client";
import { useActionState } from "react";
import { FEEDBACK_KIND_LABEL, type FeedbackKind } from "@/lib/feedback-kinds";
import { sendFeedback, type FeedbackFormState } from "./actions";

export function FeedbackForm({ page }: { page: string }) {
  const [state, action, pending] = useActionState<FeedbackFormState, FormData>(sendFeedback, { errors: [] });
  return (
    <form action={action} className="section stack">
      {state.errors.length > 0 && (
        <div className="error" role="alert">
          <ul>{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      <input type="hidden" name="page" value={page} />
      <div className="choices">
        {(Object.keys(FEEDBACK_KIND_LABEL) as FeedbackKind[]).map((k, i) => (
          <label key={k} className="choice">
            <input type="radio" name="kind" value={k} defaultChecked={i === 0} /> {FEEDBACK_KIND_LABEL[k]}
          </label>
        ))}
      </div>
      <label className="field">
        <span>What happened, or what would help?</span>
        <textarea name="message" rows={6} maxLength={4000} required placeholder="What you were trying to do, what you expected, and what happened instead." />
        <small className="sub">We&apos;ll see the page you came from ({page}) and your browser. Please don&apos;t include card numbers or tax IDs.</small>
      </label>
      <div className="row">
        <button className="button" type="submit" disabled={pending}>Send feedback</button>
      </div>
    </form>
  );
}
