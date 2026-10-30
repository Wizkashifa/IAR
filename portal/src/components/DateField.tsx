"use client";

import { useId } from "react";
import { DatePickerInput, TimeInput } from "@mantine/dates";
import { Field, errorId } from "./Field";
import styles from "./DateField.module.css";

type Base = { name?: string; label: string; hint?: string; error?: string; required?: boolean; disabled?: boolean };

/**
 * A date, picked from a calendar. Shown as "Sat, Nov 21, 2026"; submitted with
 * the form as "2026-11-21" under `name`, so server actions read it like a
 * native date input. Controlled (value + onChange) or not (defaultValue).
 */
export function DateField({ value, defaultValue, onChange, min, max, clearable, placeholder = "Pick a date", ...f }: Base & { value?: string | null; defaultValue?: string | null; onChange?: (v: string | null) => void; min?: string; max?: string; clearable?: boolean; placeholder?: string }) {
  const id = useId();
  return (
    <Field label={f.label} hint={f.hint} error={f.error} required={f.required} htmlFor={id}>
      <DatePickerInput
        id={id}
        name={f.name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (v) => onChange(v ? String(v).slice(0, 10) : null) : undefined}
        minDate={min}
        maxDate={max}
        clearable={clearable}
        clearButtonProps={{ "aria-label": `Clear ${f.label.toLowerCase()}`, className: styles.clear }}
        required={f.required}
        disabled={f.disabled}
        placeholder={placeholder}
        valueFormat="ddd, MMM D, YYYY"
        firstDayOfWeek={0}
        error={Boolean(f.error)}
        aria-describedby={f.error ? errorId(id) : undefined}
      />
    </Field>
  );
}

/** A time of day ("18:30" in the form), using the phone's own time picker. */
export function TimeField({ value, defaultValue, onChange, step = 900, ...f }: Base & { value?: string; defaultValue?: string; onChange?: (v: string) => void; step?: number }) {
  const id = useId();
  return (
    <Field label={f.label} hint={f.hint} error={f.error} required={f.required} htmlFor={id}>
      <TimeInput
        id={id}
        name={f.name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (e) => onChange(e.currentTarget.value) : undefined}
        required={f.required}
        disabled={f.disabled}
        step={step}
        error={Boolean(f.error)}
        aria-describedby={f.error ? errorId(id) : undefined}
      />
    </Field>
  );
}
