"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonClass } from "@/components/Button";
import { SubmitButton } from "@/components/SubmitButton";
import { FileDrop } from "@/components/FileDrop";
import { FormActions } from "@/components/Field";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import styles from "../tickets.module.css";
import { STATUS_LABEL, TEAM_LABEL, URGENCY, type TicketStatus, type TicketTeam } from "@/lib/tickets/types";
import type { ImportState } from "../actions";
import { Checkbox } from "@/components/Choices";
import { DataTable } from "@/components/DataTable";

export default function ImportForm({ action }: { action: (prev: ImportState, form: FormData) => Promise<ImportState> }) {
  const [state, formAction] = useActionState(action, { stage: "start" });

  if (state.stage === "done") {
    const n = state.created?.length ?? 0;
    return (
      <>
        <Note tone="ok">
          {n === 0 ? "Nothing new was imported." : `Imported ${n} ticket${n === 1 ? "" : "s"} from Jira.`}
          {state.alreadyThere ? ` ${state.alreadyThere} had already been imported by someone else and were skipped.` : ""}
        </Note>
        {state.failed ? <Note tone="bad">{state.failed} couldn&apos;t be saved. Import the same file again to retry them; nothing is imported twice.</Note> : null}
        {n > 0 && (
          <DataTable framed>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Jira</th>
                </tr>
              </thead>
              <tbody>
                {state.created!.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/it-maintenance/${c.id}`}>
                        <strong>{c.id}</strong>
                      </Link>{" "}
                      {c.title}
                    </td>
                    <td className="hint">{c.key}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
        )}
        <FormActions sticky={false}>
          <Button variant="primary" href="/it-maintenance?view=team">
            Go to the board
          </Button>
          {/* A full reload starts the form over. */}
          <a href="/it-maintenance/import" className={buttonClass({ variant: "quiet" })}>
            Import another file
          </a>
        </FormActions>
      </>
    );
  }

  if (state.stage === "preview" && state.preview) {
    const p = state.preview;
    const statuses = Object.entries(p.counts.status) as [TicketStatus, number][];
    const teams = Object.entries(p.counts.team) as [TicketTeam, number][];
    return (
      <>
        <Panel title="What would happen">
          <p>
            <strong>{p.ready.length}</strong> ticket{p.ready.length === 1 ? "" : "s"} will be created
            {teams.length > 0 && <> ({teams.map(([t, n]) => `${n} ${TEAM_LABEL[t]}`).join(", ")})</>}.
          </p>
          {statuses.length > 0 && (
            <ul>
              {statuses.map(([s, n]) => (
                <li key={s}>
                  {STATUS_LABEL[s]}: {n}
                </li>
              ))}
            </ul>
          )}
          {p.alreadyImported.length > 0 && <p className="hint">{p.alreadyImported.length} already imported earlier: skipped ({p.alreadyImported.map((x) => x.key).join(", ")}).</p>}
          {p.skippedDone.length > 0 && <p className="hint">{p.skippedDone.length} already done in Jira: skipped{state.includeDone ? "" : " (tick “Also bring over done issues” to keep them as closed tickets)"}.</p>}
        </Panel>

        {p.problems.length > 0 && (
          <>
            <h2>Rows that can&apos;t come over ({p.problems.length})</h2>
            <p className="hint">Fix these in Jira and export again, or add them by hand with “Report a problem”. Row numbers are as a spreadsheet shows them (row 1 is the header).</p>
            <DataTable framed>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Issue</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {p.problems.map((x) => (
                    <tr key={`${x.row}-${x.key}`}>
                      <td className="hint">{x.row}</td>
                      <td>{x.key ?? "—"}</td>
                      <td>{x.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
          </>
        )}

        {p.unmatchedPeople.length > 0 && (
          <Note tone="info">
            Jira gave names, not email addresses, for: {p.unmatchedPeople.join(", ")}. Their tickets come over unassigned, with the name in the history; pick who has each one on the board. Where they reported it, you become the reporter of record.
          </Note>
        )}

        {p.ready.length > 0 && (
          <>
            <h2>Tickets to create</h2>
            <DataTable framed>
                <thead>
                  <tr>
                    <th>Jira</th>
                    <th>Ticket</th>
                    <th>Status</th>
                    <th>Who has it</th>
                  </tr>
                </thead>
                <tbody>
                  {p.ready.map((r) => (
                    <tr key={r.key}>
                      <td className="hint">{r.key}</td>
                      <td>
                        <strong>{r.title}</strong>
                        <div className="hint">
                          {TEAM_LABEL[r.team]} · {r.room} · {URGENCY[r.urgency].label} urgency
                        </div>
                      </td>
                      <td>{STATUS_LABEL[r.status]}</td>
                      <td className="hint">{r.assignee ?? "Nobody yet"}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
          </>
        )}

        <form action={formAction}>
          <input type="hidden" name="step" value="import" />
          <input type="hidden" name="includeDone" value={state.includeDone ? "1" : ""} />
          <textarea name="csv" defaultValue={state.csv} hidden readOnly />
          <FormActions sticky={false}>
            {p.ready.length > 0 && <SubmitButton busy="Importing…">{`Import ${p.ready.length} ticket${p.ready.length === 1 ? "" : "s"}`}</SubmitButton>}
            <a href="/it-maintenance/import" className={buttonClass({ variant: "quiet" })}>
              Start over
            </a>
          </FormActions>
        </form>
      </>
    );
  }

  return (
    <form action={formAction} className="stack">
      {state.error && (
        <div role="alert">
          <Note tone="bad">{state.error}</Note>
        </div>
      )}
      <Panel title="Jira export">
        <div className="stack">
        <ol className={styles.steps}>
          <li>In Jira, open the facilities project&apos;s issues (a filter of the open ones is enough).</li>
          <li>Choose Export → Export CSV (all fields).</li>
          <li>Upload the file here. You&apos;ll see what would happen before anything is saved.</li>
        </ol>
        <FileDrop name="file" label="CSV file" accept={["text/csv", ".csv"]} multiple={false} maxSizeMb={5} required />
        <Checkbox name="includeDone">Also bring over done issues, as closed tickets (for the record)</Checkbox>
        </div>
      </Panel>
      <input type="hidden" name="step" value="preview" />
      <FormActions sticky={false}>
        <SubmitButton busy="Reading the file…">Preview</SubmitButton>
      </FormActions>
    </form>
  );
}
