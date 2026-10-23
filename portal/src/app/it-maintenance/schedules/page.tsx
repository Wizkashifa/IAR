import Link from "next/link";
import { todayLocal } from "@/lib/away";
import { requireViewer } from "@/lib/viewer";
import { teamMembers, ticketActor } from "@/lib/tickets/context";
import { locationChoices } from "@/lib/tickets/locations";
import { googleRooms } from "@/lib/rooms-google";
import { scheduleStore } from "@/lib/tickets/schedule-store";
import { FREQUENCIES, FREQUENCY_LABEL, type TicketSchedule } from "@/lib/tickets/schedules";
import { TEAM_LABEL, TEAM_NAME, URGENCIES, URGENCY } from "@/lib/tickets/types";
import { teamsOf } from "@/lib/tickets/workflow";
import { Flash } from "../../ui";
import { pauseSchedule, saveSchedule } from "../actions";
import { FLASH, fmtDay } from "../ui";

export const dynamic = "force-dynamic";

export default async function SchedulesPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; ok?: string; error?: string }> }) {
  const locations = locationChoices((await googleRooms()).map((r) => r.name));
  const sp = await searchParams;
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const teams = teamsOf(actor);
  const crumb = (
    <p className="crumb">
      <Link href="/it-maintenance">IT &amp; Maintenance</Link>
    </p>
  );
  if (teams.length === 0) {
    return (
      <>
        {crumb}
        <h1>Preventive schedules</h1>
        <div className="panel empty">Schedules belong to the IT Services and Facility Maintenance teams. If you think you should be on one, ask its chair.</div>
      </>
    );
  }
  const [all, members] = await Promise.all([(await scheduleStore()).list(), teamMembers()]);
  const list = all.filter((s) => teams.includes(s.team));
  const editing = sp.edit ? list.find((s) => s.id === sp.edit) : undefined;
  const today = todayLocal();

  return (
    <>
      {crumb}
      <div className="pagehead">
        <div>
          <h1>Preventive schedules</h1>
          <p className="lead">Regular jobs, like filter changes and alarm checks. On the due day the portal opens a ticket for the team, then moves the schedule to the next date.</p>
        </div>
        {!editing && !sp.new && (
          <Link href="/it-maintenance/schedules?new=1" className="button">
            Add a schedule
          </Link>
        )}
      </div>
      <Flash ok={sp.ok} error={sp.error} messages={FLASH} />

      {(editing || sp.new) && <ScheduleForm s={editing} />}

      {list.length === 0 ? (
        <div className="panel empty">No schedules yet.</div>
      ) : (
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>How often</th>
                <th>Next ticket</th>
                <th>Goes to</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className="sub">
                      {teams.length > 1 ? `${TEAM_LABEL[s.team]} · ` : ""}
                      {s.room}
                      {s.equipment ? ` · ${s.equipment}` : ""}
                    </div>
                    {s.lastTicketId && (
                      <div className="sub">
                        Last: <Link href={`/it-maintenance/${s.lastTicketId}`}>{s.lastTicketId}</Link>
                        {s.lastCreatedOn ? ` on ${fmtDay(s.lastCreatedOn)}` : ""}
                      </div>
                    )}
                  </td>
                  <td>{FREQUENCY_LABEL[s.frequency]}</td>
                  <td>
                    {s.paused ? <span className="pill draft">Paused</span> : fmtDay(s.next)}
                    {!s.paused && s.next <= today && <div className="sub due">Opens with the next daily run</div>}
                  </td>
                  <td className="sub">{s.assigneeEmail ?? `The ${TEAM_LABEL[s.team]} team`}</td>
                  <td className="nowrap">
                    <Link href={`/it-maintenance/schedules?edit=${s.id}`}>Edit</Link>{" "}
                    <form action={pauseSchedule} className="inlineform">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="paused" value={s.paused ? "0" : "1"} />
                      <button className="linkbtn" type="submit">
                        {s.paused ? "Resume" : "Pause"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  function ScheduleForm({ s }: { s?: TicketSchedule }) {
    return (
      <form action={saveSchedule} className="form">
        {s && <input type="hidden" name="id" value={s.id} />}
        <fieldset className="section">
          <legend>{s ? `Edit “${s.name}”` : "New schedule"}</legend>
          <div className="grid2">
            <label className="field">
              <span>Job</span>
              <input name="name" defaultValue={s?.name} required maxLength={80} placeholder="HVAC filter check" />
            </label>
            <label className="field">
              <span>Team</span>
              <select name="team" defaultValue={s?.team ?? teams[0]}>
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {TEAM_NAME[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>How often</span>
              <select name="frequency" defaultValue={s?.frequency ?? "monthly"}>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{s ? "Next date" : "First date"}</span>
              <input type="date" name="next" defaultValue={s?.next ?? today} min={s ? undefined : today} required />
            </label>
            <label className="field">
              <span>Where</span>
              <input name="room" list="ticket-locations" defaultValue={s?.room} required maxLength={120} />
              <datalist id="ticket-locations">
                {locations.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Equipment (optional)</span>
              <input name="equipment" defaultValue={s?.equipment} maxLength={120} />
            </label>
            <label className="field">
              <span>Urgency</span>
              <select name="urgency" defaultValue={s?.urgency ?? "normal"}>
                {URGENCIES.map((u) => (
                  <option key={u} value={u}>
                    {URGENCY[u].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Assign each ticket to</span>
              <select name="assignee" defaultValue={s?.assigneeEmail ?? ""}>
                <option value="">Nobody: it goes to the team</option>
                {teams.map((t) => (
                  <optgroup key={t} label={TEAM_NAME[t]}>
                    {members[t].map((m) => (
                      <option key={`${t}-${m}`} value={m}>
                        {m}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <small>Pick someone on the schedule&apos;s team.</small>
            </label>
          </div>
          <label className="field">
            <span>What to do (copied onto each ticket)</span>
            <textarea name="description" rows={3} defaultValue={s?.description} maxLength={3000} placeholder="Inspect and replace the filters on both rooftop units." />
          </label>
          <div className="row spaced">
            <button className="button" type="submit">
              {s ? "Save" : "Add schedule"}
            </button>
            <Link href="/it-maintenance/schedules" className="button secondary">
              Cancel
            </Link>
          </div>
        </fieldset>
      </form>
    );
  }
}
