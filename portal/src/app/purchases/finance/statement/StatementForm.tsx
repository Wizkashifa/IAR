"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, buttonClass } from "@/components/Button";
import { DataTable, cell } from "@/components/DataTable";
import { FileDrop } from "@/components/FileDrop";
import { FormActions } from "@/components/Field";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { fmtMoney, fmtMonth } from "@/lib/format";
import type { StatementState } from "./actions";
import styles from "./statement.module.css";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" type="submit" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

/** Upload, check what was read, then confirm: only then do cardholders hear. */
export default function StatementForm({ action, sampleHref }: { action: (prev: StatementState, form: FormData) => Promise<StatementState>; sampleHref?: string }) {
  const [state, formAction] = useActionState(action, { stage: "start" });

  if (state.stage === "done") {
    return (
      <>
        <Note tone="ok">
          The {fmtMonth(state.month)} statement is in. {state.told === 0 ? "No cardholders needed telling." : `${state.told} cardholder${state.told === 1 ? " was" : "s were"} told to add their receipts.`}
          {state.unknown > 0 && ` ${state.unknown} card${state.unknown === 1 ? " isn't" : "s aren't"} in Portal Settings, so nobody was told about ${state.unknown === 1 ? "it" : "them"}.`}
        </Note>
        <FormActions sticky={false}>
          <Button variant="primary" href="/purchases/finance">
            Back to the finance desk
          </Button>
          {/* A full reload starts the form over. */}
          <a href="/purchases/finance/statement" className={buttonClass({ variant: "quiet" })}>
            Upload another statement
          </a>
        </FormActions>
      </>
    );
  }

  if (state.stage === "preview") {
    const p = state.preview;
    const unknown = p.cards.filter((c) => !c.holder);
    const charges = p.cards.reduce((n, c) => n + c.charges, 0);
    return (
      <>
        <Panel title={`${fmtMonth(p.month)} statement`} right={fmtMoney(p.total)}>
          <p>
            <strong>{p.cards.length}</strong> card{p.cards.length === 1 ? "" : "s"}, <strong>{charges}</strong> charge{charges === 1 ? "" : "s"}. Every card&apos;s charges add up to the statement&apos;s totals.
          </p>
          {p.replacing && <Note tone="warn">A statement for {fmtMonth(p.month)} is already in. Confirming replaces it. No receipts have been sent from it yet.</Note>}
        </Panel>
        {unknown.length > 0 && (
          <Note tone="warn">
            {unknown.length === 1 ? "One card on the statement isn't" : `${unknown.length} cards on the statement aren't`} in Portal Settings ({unknown.map((c) => `···${c.last4}`).join(", ")}), so nobody can send receipts for {unknown.length === 1 ? "it" : "them"} yet. <Link href="/admin?open=cards">Add the card in Portal Settings</Link>, then upload the statement again.
          </Note>
        )}
        <Panel title="Cards" flush>
          <DataTable caption="Cards on the statement">
            <thead>
              <tr>
                <th>Card</th>
                <th>Cardholder</th>
                <th className={cell.num}>Charges</th>
                <th className={cell.num}>Total</th>
              </tr>
            </thead>
            <tbody>
              {p.cards.map((c) => (
                <tr key={c.last4}>
                  <td data-label="Card">···{c.last4}</td>
                  <td data-label="Cardholder">
                    {c.holder ?? <Pill tone="warn">Not in Portal Settings</Pill>}
                    <span className={cell.sub}>On the statement: {c.nameOnStatement}</span>
                  </td>
                  <td data-label="Charges" className={cell.num}>
                    {c.charges}
                  </td>
                  <td data-label="Total" className={cell.num}>
                    {fmtMoney(c.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
        {p.quiet.length > 0 && <p className="hint">No charges this month on {p.quiet.map((c) => `···${c.last4} (${c.holder})`).join(", ")}.</p>}
        <form action={formAction}>
          <input type="hidden" name="step" value="confirm" />
          <input type="hidden" name="month" value={p.month} />
          <FormActions sticky={false}>
            <Submit label="Import and tell cardholders" busy="Importing…" />
            <a href="/purchases/finance/statement" className={buttonClass({ variant: "quiet" })}>
              Start over
            </a>
          </FormActions>
        </form>
      </>
    );
  }

  return (
    <form action={formAction} className="stack">
      {state.errors && state.errors.length > 0 && (
        <div role="alert">
          <Note tone="bad">
            {state.errors.length === 1 ? (
              state.errors[0]
            ) : (
              <>
                Nothing was imported, because the statement didn&apos;t add up or couldn&apos;t be read:
                <ul className={styles.errors}>
                  {state.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </>
            )}
          </Note>
        </div>
      )}
      <Panel title="Statement PDF">
        <div className="stack">
          <ol className={styles.steps}>
            <li>In Truist online banking, download the month&apos;s credit card statement as a PDF.</li>
            <li>Upload it here. You&apos;ll see what was read before anything is saved.</li>
            <li>Confirm, and each cardholder is told their charges are ready for receipts.</li>
          </ol>
          <FileDrop name="file" label="Statement PDF" accept={["application/pdf", ".pdf"]} multiple={false} maxSizeMb={10} required />
          {sampleHref && (
            <p className="hint">
              Trying it out? <a href={sampleHref}>Download a sample statement</a> made up for this month.
            </p>
          )}
        </div>
      </Panel>
      <input type="hidden" name="step" value="preview" />
      <FormActions sticky={false}>
        <Submit label="Read the statement" busy="Reading the statement…" />
      </FormActions>
    </form>
  );
}
