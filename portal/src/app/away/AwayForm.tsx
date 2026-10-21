"use client";
import { useActionState } from "react";
import type { Away } from "@/lib/away";
import { saveAway, type AwayFormState } from "./actions";

export function AwayForm({ current, today, domain, suggestions }: { current: Away | null; today: string; domain: string; suggestions: string[] }) {
  const [state, action, pending] = useActionState<AwayFormState, FormData>(saveAway, { errors: [] });
  return (
    <form action={action} className="section stack">
      {state.errors.length > 0 && (
        <div className="error" role="alert">
          <ul>{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      <div className="grid2">
        <label className="field">
          <span>First day away</span>
          <input type="date" name="from" defaultValue={current?.from ?? today} required />
        </label>
        <label className="field">
          <span>Last day away</span>
          <input type="date" name="until" min={today} defaultValue={current?.until ?? ""} required />
        </label>
      </div>
      <label className="field">
        <span>Who covers your approvals</span>
        <input type="email" name="delegate" list="delegates" placeholder={`name@${domain}`} defaultValue={current?.delegate ?? ""} required />
        <small className="sub">Usually your committee&apos;s backup approver. They&apos;re told by email, and can approve, return or reject requests waiting on you. Each one is recorded as on your behalf.</small>
        {suggestions.length > 0 && (
          <datalist id="delegates">
            {suggestions.map((s) => <option key={s} value={s} />)}
          </datalist>
        )}
      </label>
      <label className="field">
        <span>Note for them (optional)</span>
        <input name="note" maxLength={300} placeholder="Travelling for Umrah; reachable by text for anything urgent" defaultValue={current?.note ?? ""} />
      </label>
      <div className="row">
        <button className="button" type="submit" disabled={pending}>{current ? "Update" : "Turn on"}</button>
      </div>
    </form>
  );
}
