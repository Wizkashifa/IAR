"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Field } from "@/components/Field";
import styles from "./calendar.module.css";
import { Checkbox } from "@/components/Choices";

/**
 * The room and committee filters, and whether to show prayers and school
 * hours. The calendar changes as soon as one does; there's no Show button.
 */
export function Filters({ rooms, committees }: { rooms: { id: string; name: string }[]; committees: string[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  // The controls change at once; the calendar follows when it has loaded.
  const [shown, setShown] = useState({ room: params.get("room") ?? "", committee: params.get("committee") ?? "", standing: params.get("standing") ?? "" });
  const set = (key: "room" | "committee" | "standing", value: string) => {
    setShown((x) => ({ ...x, [key]: value }));
    const q = new URLSearchParams(params.toString());
    if (value) q.set(key, value);
    else q.delete(key);
    start(() => router.push(`${path}?${q}`, { scroll: false }));
  };
  return (
    <div className={styles.filters} aria-busy={pending || undefined}>
      <Field label="Room" htmlFor="cal-room">
        <select id="cal-room" value={shown.room} onChange={(e) => set("room", e.target.value)}>
          <option value="">All rooms</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Committee" htmlFor="cal-committee">
        <select id="cal-committee" value={shown.committee} onChange={(e) => set("committee", e.target.value)}>
          <option value="">All committees</option>
          {committees.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Checkbox checked={shown.standing === "1"} onChange={(e) => set("standing", e.target.checked ? "1" : "")}>Show prayers, school hours and other standing holds</Checkbox>
    </div>
  );
}
