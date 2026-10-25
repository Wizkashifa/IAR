"use client";

import { useRouter } from "next/navigation";
import { Field } from "@/components/Field";
import styles from "./finance.module.css";

/** Fund, month and payment type. Picking one shows the list straight away. */
export function DeskFilters({ tab, fund, month, type, funds, months }: { tab: string; fund: string; month: string; type: string; funds: { value: string; label: string }[]; months: { value: string; label: string }[] }) {
  const router = useRouter();
  const go = (next: Record<string, string>) => {
    const q = new URLSearchParams({ tab, fund, month, type, ...next });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    router.push(`/purchases/finance?${q}`);
  };
  return (
    <form className={styles.filters} aria-label="Filter the list" onSubmit={(e) => e.preventDefault()}>
      <Field label="Fund" htmlFor="desk-fund">
        <select id="desk-fund" value={fund} onChange={(e) => go({ fund: e.target.value })}>
          <option value="">All funds</option>
          {funds.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Month" htmlFor="desk-month">
        <select id="desk-month" value={month} onChange={(e) => go({ month: e.target.value })}>
          <option value="">Any month</option>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Paid by" htmlFor="desk-type">
        <select id="desk-type" value={type} onChange={(e) => go({ type: e.target.value })}>
          <option value="">Check, ACH or card</option>
          <option value="check">Check</option>
          <option value="ach">ACH</option>
          <option value="card">IAR card</option>
        </select>
      </Field>
    </form>
  );
}
