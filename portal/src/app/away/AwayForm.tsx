"use client";
import { useActionState } from "react";
import { Button } from "@/components/Button";
import { DateField } from "@/components/DateField";
import { Field, FormActions } from "@/components/Field";
import { PeoplePicker, type PersonOption } from "@/components/PeoplePicker";
import type { Away } from "@/lib/away";
import { saveAway } from "./actions";
import { FormErrors, type FormState } from "@/components/FormErrors";

export function AwayForm({ current, today, people }: { current: Away | null; today: string; people: PersonOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAway, { errors: [] });
  return (
    <form action={action} className="stack">
      <FormErrors errors={state.errors} />
      <div className="grid two">
        <DateField name="from" label="First day away" defaultValue={current?.from ?? today} required />
        <DateField name="until" label="Last day away" min={today} defaultValue={current?.until ?? null} required />
      </div>
      <PeoplePicker
        name="delegate"
        label="Who covers your approvals"
        people={people}
        defaultValue={current?.delegate ?? null}
        required
        hint="Usually your vice chair. They're notified, and can approve, send back or decline what's waiting on you, on your behalf."
      />
      <Field label="Note for them (optional)">
        <input name="note" maxLength={300} placeholder="Travelling for Umrah; reachable by text for anything urgent" defaultValue={current?.note ?? ""} />
      </Field>
      <FormActions>
        <Button type="submit" variant="primary" disabled={pending}>
          {current ? "Save changes" : "Turn on"}
        </Button>
      </FormActions>
    </form>
  );
}
