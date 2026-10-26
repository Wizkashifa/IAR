"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Autocomplete } from "@mantine/core";
import { Field, errorId } from "./Field";

type Suggestion = { id: string; text: string };

/**
 * A mailing address, with suggestions from Google Maps as you type (through
 * /api/address). Picking one fills in the full address with its ZIP code.
 * It stays a plain text box: anything typed is kept as typed.
 */
export function AddressField({ label, hint, error, required, value, onChange, placeholder = "Street, city, state, ZIP" }: { label: string; hint?: string; error?: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId();
  const [options, setOptions] = useState<Suggestion[]>([]);
  // One session per address typed, so Google counts the typing and the pick as one lookup.
  const session = useRef("");
  const picked = useRef(false);

  useEffect(() => {
    if (picked.current) {
      picked.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) return setOptions([]);
    session.current ||= crypto.randomUUID();
    const ctl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/address?q=${encodeURIComponent(q)}&session=${session.current}`, { signal: ctl.signal });
        const body = (await res.json()) as { suggestions?: Suggestion[] };
        setOptions(body.suggestions ?? []);
      } catch {
        // Aborted or offline: no suggestions, the box still works.
      }
    }, 250);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [value]);

  const pick = async (text: string) => {
    const s = options.find((o) => o.text === text);
    picked.current = true;
    onChange(text);
    setOptions([]);
    if (!s) return;
    try {
      const res = await fetch(`/api/address?id=${encodeURIComponent(s.id)}&session=${session.current}`);
      const body = (await res.json()) as { address?: string | null };
      if (body.address) {
        picked.current = true;
        onChange(body.address);
      }
    } catch {
      // Keep the suggestion's text.
    }
    session.current = "";
  };

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id}>
      <Autocomplete
        id={id}
        value={value}
        onChange={onChange}
        onOptionSubmit={pick}
        data={options.map((o) => o.text)}
        filter={({ options: all }) => all}
        maxLength={300}
        placeholder={placeholder}
        required={required}
        error={Boolean(error)}
        aria-describedby={error ? errorId(id) : undefined}
        comboboxProps={{ shadow: "md" }}
        autoComplete="off"
      />
    </Field>
  );
}
