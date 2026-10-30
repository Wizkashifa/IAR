"use client";

import { useId } from "react";
import { MultiSelect } from "@mantine/core";
import { Field, errorId } from "./Field";

/** `formerly`: an old name ("Previously Library"), so a search for it still finds the room. */
export type RoomOption = { id: string; name: string; capacity?: number; formerly?: string };

/**
 * Pick one or more rooms, searching by name. Rooms in `usedMost` are listed
 * first under "Used most". Submitted under `name` as the room ids joined with
 * commas ("mphAB,cafe"); empty means off-site.
 */
export function RoomPicker({ rooms, usedMost = [], value, defaultValue, onChange, name, label = "Room or rooms", hint, error, required, disabled, max }: { rooms: RoomOption[]; usedMost?: string[]; value?: string[]; defaultValue?: string[]; onChange?: (ids: string[]) => void; name?: string; label?: string; hint?: string; error?: string; required?: boolean; disabled?: boolean; max?: number }) {
  const id = useId();
  const item = (r: RoomOption) => ({ value: r.id, label: r.capacity ? `${r.name} (${r.capacity})` : r.name });
  const top = usedMost.map((rid) => rooms.find((r) => r.id === rid)).filter((r): r is RoomOption => Boolean(r));
  const rest = rooms.filter((r) => !usedMost.includes(r.id));
  const formerly = new Map(rooms.filter((r) => r.formerly).map((r) => [r.id, r.formerly!]));
  const data = top.length ? [{ group: "Used most", items: top.map(item) }, { group: "All rooms", items: rest.map(item) }] : rest.map(item);
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id}>
      <MultiSelect
        id={id}
        name={name}
        data={data}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        searchable
        clearable
        hidePickedOptions
        nothingFoundMessage="No room by that name"
        placeholder="Search rooms"
        maxValues={max}
        required={required}
        disabled={disabled}
        error={Boolean(error)}
        aria-describedby={error ? errorId(id) : undefined}
        comboboxProps={{ shadow: "md" }}
        renderOption={({ option }) => <span title={formerly.get(option.value)}>{option.label}</span>}
      />
    </Field>
  );
}
