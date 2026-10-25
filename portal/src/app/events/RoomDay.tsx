"use client";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/Button";
import { DateField } from "@/components/DateField";
import { Field } from "@/components/Field";
import styles from "./events.module.css";

const shift = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * A place (a room, or a campus on the run sheet) and a day. Changing either
 * shows that day right away: the page reads ?<param>= and ?date=, so there's
 * no button to press.
 */
export function RoomDay({ options, value, param = "room", label = "Room", date, today }: { options: { id: string; name: string }[]; value?: string; param?: string; label?: string; date: string; today: string }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const go = (next: { value?: string; date?: string }) => {
    const q = new URLSearchParams();
    const v = next.value ?? value;
    if (v) q.set(param, v);
    q.set("date", next.date ?? date);
    start(() => router.replace(`${path}?${q.toString()}`, { scroll: false }));
  };
  return (
    <div className={options.length > 1 ? styles.pick : `${styles.pick} ${styles.dayOnly}`} aria-busy={pending}>
      {options.length > 1 && (
        <Field label={label}>
          <select value={value} onChange={(e) => go({ value: e.target.value })}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </Field>
      )}
      <DateField label="Day" value={date} onChange={(v) => v && go({ date: v })} />
      <div className={styles.days}>
        <Button icon="chevL" onClick={() => go({ date: shift(date, -1) })}><span className="sr-only">Day before</span></Button>
        <Button onClick={() => go({ date: today })} disabled={date === today}>Today</Button>
        <Button icon="chevR" onClick={() => go({ date: shift(date, 1) })}><span className="sr-only">Next day</span></Button>
      </div>
    </div>
  );
}
