"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { STATUS_LABEL, TEAM_LABEL, URGENCY, type TicketStatus, type TicketTeam } from "@/lib/tickets/types";
import type { ImportState } from "../actions";

function Submit({ label, busy, secondary }: { label: string; busy: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`button${secondary ? " secondary" : ""}`} type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

export default function ImportForm({ action }: { action: (prev: ImportState, form: FormData) => Promise<ImportState> }) {
  const [state, formAction] = useActionState(action, { stage: "start" });

  if (state.stage === "done") {
    const n = state.created?.length ?? 0;
    return (
      <>
        <div className="flash" role="status">
          {n === 0 ? "Nothing new was imported." : `Imported ${n} ticket${n === 1 ? "" : "s"} from Jira.`}
          {state.alreadyThere ? ` ${state.alreadyThere} had already been imported by someone else and were skipped.` : ""}
        </div>
        {state.failed ? <div className="error">{state.failed} couldn&apos;t be saved. Import the same file again to retry them; nothing is imported twice.</div> : null}
        {n > 0 && (
          <div className="tablewrap">
            <table className="table">
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
                    <td className="sub">{c.key}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="row spaced">
          <Link href="/it-maintenance" className="button">
            Go to the board
          </Link>
          {/* A full reload starts the form over. */}
          <a href="/it-maintenance/import" className="button secondary">
            Import another file
          </a>
        </p>
      </>
    );
  }

  if (state.stage === "preview" && state.preview) {
    const p = state.preview;
    const statuses = Object.entries(p.counts.status) as [TicketStatus, number][];
    const teams = Object.entries(p.counts.team) as [TicketTeam, number][];
    return (
      <>
        <h2>What would happen</h2>
        <div className="panel">
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
          {p.alreadyImported.length > 0 && <p className="sub">{p.alreadyImported.length} already imported earlier: skipped ({p.alreadyImported.map((x) => x.key).join(", ")}).</p>}
          {p.skippedDone.length > 0 && <p className="sub">{p.skippedDone.length} already done in Jira: skipped{state.includeDone ? "" : " (tick “Also bring over done issues” to keep them as closed tickets)"}.</p>}
        </div>

        {p.problems.length > 0 && (
          <>
            <h2>Rows that can&apos;t come over ({p.problems.length})</h2>
            <p className="note">Fix these in Jira and export again, or add them by hand with “Report a problem”. Row numbers are as a spreadsheet shows them (row 1 is the header).</p>
            <div className="tablewrap">
              <table className="table">
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
                      <td className="sub">{x.row}</td>
                      <td>{x.key ?? "—"}</td>
                      <td>{x.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {p.unmatchedPeople.length > 0 && (
          <div className="callout info">
            Jira gave names, not email addresses, for: {p.unmatchedPeople.join(", ")}. Their tickets come over unassigned, with the name in the history; pick who has each one on the board. Where they reported it, you become the reporter of record.
          </div>
        )}

        {p.ready.length > 0 && (
          <>
            <h2>Tickets to create</h2>
            <div className="tablewrap">
              <table className="table">
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
                      <td className="sub">{r.key}</td>
                      <td>
                        <strong>{r.title}</strong>
                        <div className="sub">
                          {TEAM_LABEL[r.team]} · {r.room} · {URGENCY[r.urgency].label} urgency
                        </div>
                      </td>
                      <td>{STATUS_LABEL[r.status]}</td>
                      <td className="sub">{r.assignee ?? "Nobody yet"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <form action={formAction} className="row spaced">
          <input type="hidden" name="step" value="import" />
          <input type="hidden" name="includeDone" value={state.includeDone ? "1" : ""} />
          <textarea name="csv" defaultValue={state.csv} hidden readOnly />
          {p.ready.length > 0 && <Submit label={`Import ${p.ready.length} ticket${p.ready.length === 1 ? "" : "s"}`} busy="Importing…" />}
          <a href="/it-maintenance/import" className="button secondary">
            Start over
          </a>
        </form>
      </>
    );
  }

  return (
    <form action={formAction} className="form">
      {state.error && (
        <div className="error" role="alert">
          {state.error}
        </div>
      )}
      <fieldset className="section">
        <legend>Jira export</legend>
        <ol className="steps">
          <li>In Jira, open the facilities project&apos;s issues (a filter of the open ones is enough).</li>
          <li>Choose Export → Export CSV (all fields).</li>
          <li>Upload the file here. You&apos;ll see what would happen before anything is saved.</li>
        </ol>
        <label className="field">
          <span>CSV file</span>
          <input type="file" name="file" accept=".csv,text/csv" required />
        </label>
        <label className="inline spaced">
          <input type="checkbox" name="includeDone" /> Also bring over done issues, as closed tickets (for the record)
        </label>
      </fieldset>
      <input type="hidden" name="step" value="preview" />
      <div>
        <Submit label="Preview" busy="Reading the file…" />
      </div>
    </form>
  );
}
