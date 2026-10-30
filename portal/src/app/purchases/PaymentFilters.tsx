"use client";

import { useRouter } from "next/navigation";
import { Field } from "@/components/Field";
import styles from "./purchases.module.css";

type Option = { value: string; label: string };

/**
 * Which requests to show and, on finance's lists (To pay, Enter in QuickBooks,
 * Refunds), the fund and month. Picking one shows the list straight away;
 * picking another list starts its fund and month afresh.
 */
export function PaymentFilters({ view, views, fund, month, funds, months }: { view: string; views: Option[]; fund: string; month: string; funds?: Option[]; months?: Option[] }) {
  const router = useRouter();
  const go = (next: Record<string, string>) => {
    const q = new URLSearchParams({ view, fund, month, ...next });
    for (const [k, v] of [...q.entries()]) if (!v || (k === "view" && v === "all")) q.delete(k);
    router.push(`/purchases${q.size ? `?${q}` : ""}`);
  };
  return (
    <form className={styles.filters} aria-label="Filter the list" onSubmit={(e) => e.preventDefault()}>
      <Field label="Show" htmlFor="pay-view">
        <select id="pay-view" value={view} onChange={(e) => go({ view: e.target.value, fund: "", month: "" })}>
          {views.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </Field>
      {funds && (
        <Field label="Fund" htmlFor="pay-fund">
          <select id="pay-fund" value={fund} onChange={(e) => go({ fund: e.target.value })}>
            <option value="">All funds</option>
            {funds.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {months && (
        <Field label="Month" htmlFor="pay-month">
          <select id="pay-month" value={month} onChange={(e) => go({ month: e.target.value })}>
            <option value="">Any month</option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      )}
    </form>
  );
}
