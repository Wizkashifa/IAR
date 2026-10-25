"use client";

import { useId } from "react";
import { Select } from "@mantine/core";
import { Field, errorId } from "./Field";

export type PersonOption = { email: string; name: string; note?: string };

/** Pick one person by name (search by name or address). Submitted under `name` as their email address. */
export function PeoplePicker({ people, value, defaultValue, onChange, name, label, hint, error, required, disabled, placeholder = "Search by name" }: { people: PersonOption[]; value?: string | null; defaultValue?: string | null; onChange?: (email: string | null) => void; name?: string; label: string; hint?: string; error?: string; required?: boolean; disabled?: boolean; placeholder?: string }) {
  const id = useId();
  const data = people.map((p) => ({ value: p.email, label: p.note ? `${p.name} · ${p.note}` : p.name }));
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id}>
      <Select
        id={id}
        name={name}
        data={data}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        searchable
        clearable={!required}
        filter={({ options, search }) => {
          const q = search.trim().toLowerCase();
          return options.filter((o) => "value" in o && (o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)));
        }}
        nothingFoundMessage="Nobody by that name"
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        error={Boolean(error)}
        aria-describedby={error ? errorId(id) : undefined}
        comboboxProps={{ shadow: "md" }}
      />
    </Field>
  );
}
