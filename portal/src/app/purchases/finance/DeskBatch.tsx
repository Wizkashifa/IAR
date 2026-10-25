"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/Confirm";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { ItemRow } from "@/components/ItemRow";
import { Panel } from "@/components/Panel";
import type { DeskTab } from "@/lib/purchases/finance-desk";
import styles from "./finance.module.css";
import { Checkbox } from "@/components/Choices";

/** One row on the desk, prepared on the server (names, amounts and dates already in words). */
export type DeskRow = {
  key: string;
  id: string;
  title: string;
  href: string;
  sub: string;
  status: string;
  /** Dollars, for the total of what's ticked. */
  amount: number;
  amountText: string;
  /** The request's updatedAt, so a request that changed meanwhile isn't acted on blind. */
  version: string;
  /** "Check" or "ACH", from how the requester asked to be paid. */
  method?: string;
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const ACTION: Record<DeskTab, { value: string; label: string; title: (n: number) => string; message: string }> = {
  pay: { value: "pay", label: "Mark paid", title: (n) => `Mark ${n} paid?`, message: "Each requester is told it's paid, and each request moves on to QuickBooks." },
  books: { value: "books", label: "Mark entered in QuickBooks", title: (n) => `Mark ${n} entered in QuickBooks?`, message: "Each request is then complete." },
  returns: { value: "resolve", label: "Mark the money received", title: (n) => `Record ${n} as received?`, message: "Each refund or repayment is marked as back with IAR." },
};

/**
 * The list with a tick box on each row, "Select all", and what to do with the
 * ticked ones. The form posts to the finance desk action, which runs each
 * request through the workflow on its own.
 */
export function DeskBatch({ tab, rows, back, action, title }: { tab: DeskTab; rows: DeskRow[]; back: string; action: (form: FormData) => Promise<void>; title: string }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const on = rows.filter((r) => picked.has(r.key));
  const all = rows.length > 0 && on.length === rows.length;
  const toggle = (key: string) => setPicked((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const a = ACTION[tab];
  const total = on.reduce((s, r) => s + r.amount, 0);

  return (
    <form action={action} className="stack">
      <input type="hidden" name="back" value={back} />
      {[...new Set(rows.map((r) => r.id))].map((id) => (
        <input key={id} type="hidden" name={`v-${id}`} value={rows.find((r) => r.id === id)!.version} />
      ))}
      <Panel
        title={title}
        right={
          rows.length > 0 ? (
            <Checkbox checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.key)))} quiet>Select all {rows.length}</Checkbox>
          ) : undefined
        }
        flush
      >
        {rows.length === 0 ? (
          <EmptyState>Nothing here with these filters.</EmptyState>
        ) : (
          <ul className={styles.list}>
            {rows.map((r) => (
              <ItemRow
                key={r.key}
                title={r.title}
                id={r.id}
                href={r.href}
                sub={r.sub}
                status={r.status}
                state="act"
                right={<span className={styles.amount}>{r.amountText}</span>}
                lead={<label className={styles.pick}><input type="checkbox" name="pick" value={r.key} checked={picked.has(r.key)} onChange={() => toggle(r.key)} aria-label={`Select ${r.id}, ${r.title}`} /></label>}
              />
            ))}
          </ul>
        )}
      </Panel>

      {rows.length > 0 && (
        <Panel title={on.length ? `${on.length} selected · ${money(total)}` : "Nothing selected yet"} level={3}>
          {on.length === 0 ? (
            <p className={styles.hint}>Tick the requests above, or Select all, then choose what to do with them.</p>
          ) : (
            <div className="stack">
              {tab === "pay" && (
                <>
                  <div className="grid split">
                    <Field label="How they were paid" htmlFor="desk-method">
                      <select id="desk-method" name="method" defaultValue={on.every((r) => r.method === "ACH") ? "ACH" : "Check"}>
                        <option>Check</option>
                        <option>ACH</option>
                        <option>Bill pay</option>
                      </select>
                    </Field>
                    <Field label="Reference for all (optional)" hint="Used for any request below left blank, e.g. one ACH batch number." htmlFor="desk-ref">
                      <input id="desk-ref" name="reference" maxLength={60} />
                    </Field>
                  </div>
                  <ul className={styles.refs} aria-label="Check number or reference for each">
                    {on.map((r) => (
                      <li key={r.key}>
                        <span className={styles.refName}>
                          <strong>{r.id}</strong> {r.title} · {r.amountText}
                        </span>
                        <select name={`method-${r.id}`} defaultValue="" aria-label={`How ${r.id} was paid`}>
                          <option value="">Same as above</option>
                          <option>Check</option>
                          <option>ACH</option>
                          <option>Bill pay</option>
                        </select>
                        <input name={`ref-${r.id}`} maxLength={60} placeholder="Check no. or reference" aria-label={`Check number or reference for ${r.id}`} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="row">
                <ConfirmButton variant="primary" name="action" value={a.value} title={a.title(on.length)} message={a.message} confirmLabel={a.label}>
                  {a.label}
                </ConfirmButton>
              </div>
            </div>
          )}
        </Panel>
      )}
    </form>
  );
}
