import Link from "next/link";
import { Button } from "@/components/Button";
import { DateField } from "@/components/DateField";
import { EmptyState } from "@/components/EmptyState";
import { Field, FormActions } from "@/components/Field";
import { ItemRow } from "@/components/ItemRow";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { PeoplePicker } from "@/components/PeoplePicker";
import { Pill } from "@/components/Pill";
import { todayLocal } from "@/lib/dates";
import { nameResolver } from "@/lib/names";
import { requireViewer } from "@/lib/viewer";
import { teamMembers, ticketActor } from "@/lib/tickets/context";
import { locationChoices } from "@/lib/tickets/locations";
import { googleRooms } from "@/lib/rooms-google";
import { scheduleStore } from "@/lib/tickets/schedule-store";
import { FREQUENCIES, FREQUENCY_LABEL, type TicketSchedule } from "@/lib/tickets/schedules";
import { TEAM_LABEL, TEAM_NAME, URGENCIES, URGENCY } from "@/lib/tickets/types";
import { teamsOf } from "@/lib/tickets/workflow";
import { pauseSchedule, saveSchedule } from "../actions";
import { FLASH, fmtDay } from "../ui";
import { FlashNote } from "@/components/FlashNote";
import styles from "../tickets.module.css";
import { Crumb } from "@/components/Crumb";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preventive schedules" };

const crumb = (
  <Crumb trail={[{ href: "/it-maintenance", label: "IT & Maintenance" }]} />
);

export default async function SchedulesPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const teams = teamsOf(actor);
  if (teams.length === 0) {
    return (
      <div className="stack">
        {crumb}
        <ModuleHead accent="it" title="Preventive schedules" />
        <Panel flush>
          <EmptyState>Schedules belong to the IT Services and Facility Maintenance teams. If you think you should be on one, ask its chair.</EmptyState>
        </Panel>
      </div>
    );
  }
  const [locations, all, members] = await Promise.all([googleRooms().then((r) => locationChoices(r.map((x) => x.name))), (await scheduleStore()).list(), teamMembers()]);
  const list = all.filter((s) => teams.includes(s.team));
  const editing = sp.edit ? list.find((s) => s.id === sp.edit) : undefined;
  const today = todayLocal();
  const names = await nameResolver([...teams.flatMap((t) => members[t]), ...list.map((s) => s.assigneeEmail).filter((e): e is string => Boolean(e))]);
  const people = teams.flatMap((t) => members[t].map((m) => ({ email: m, name: names(m), note: teams.length > 1 ? TEAM_LABEL[t] : undefined })));

  return (
    <div className="stack">
      {crumb}
      <ModuleHead accent="it"
        title="Preventive schedules"
        lead="Regular jobs, like filter changes and alarm checks. On the due day the portal opens a ticket for the team, then moves the schedule to the next date."
        actions={
          !editing &&
          !sp.new && (
            <Button variant="primary" icon="plus" href="/it-maintenance/schedules?new=1">
              Add a schedule
            </Button>
          )
        }
      />
      <div className="stack">
        <FlashNote ok={sp.ok} error={sp.error} messages={FLASH} />

        {(editing || sp.new) && <ScheduleForm s={editing} />}

        <Panel title="Schedules" right={<span>{list.length}</span>} flush>
          {list.length === 0 ? (
            <EmptyState>No schedules yet.</EmptyState>
          ) : (
            <ul className={styles.rowList}>
              {list.map((s) => (
                <ItemRow
                  key={s.id}
                  state={s.paused ? "bad" : s.next <= today ? "act" : "wait"}
                  title={s.name}
                  sub={
                    <>
                      {teams.length > 1 ? `${TEAM_LABEL[s.team]} · ` : ""}
                      {FREQUENCY_LABEL[s.frequency]} · {s.room}
                      {s.equipment ? ` · ${s.equipment}` : ""} · {s.assigneeEmail ? names(s.assigneeEmail) : `the ${TEAM_LABEL[s.team]} team`}
                      {s.lastTicketId && (
                        <>
                          {" "}
                          · last <Link href={`/it-maintenance/${s.lastTicketId}`}>{s.lastTicketId}</Link>
                          {s.lastCreatedOn ? ` on ${fmtDay(s.lastCreatedOn)}` : ""}
                        </>
                      )}
                    </>
                  }
                  right={
                    <span className={styles.scheduleActions}>
                      {s.paused ? (
                        <Pill tone="bad">Paused</Pill>
                      ) : (
                        <Pill tone={s.next <= today ? "warn" : "info"} title={s.next <= today ? "Opens with the next daily run" : undefined}>
                          {s.next <= today ? "Opens next run" : `Next ${fmtDay(s.next)}`}
                        </Pill>
                      )}
                      <Link href={`/it-maintenance/schedules?edit=${s.id}`}>Edit</Link>
                      <form action={pauseSchedule}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="paused" value={s.paused ? "0" : "1"} />
                        <button className={styles.linkBtn} type="submit">
                          {s.paused ? "Resume" : "Pause"}
                        </button>
                      </form>
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );

  function ScheduleForm({ s }: { s?: TicketSchedule }) {
    return (
      <Panel title={s ? `Edit “${s.name}”` : "New schedule"}>
        <form action={saveSchedule} className="stack">
          {s && <input type="hidden" name="id" value={s.id} />}
          <div className="grid">
            <Field label="Job" required>
              <input name="name" defaultValue={s?.name} required maxLength={80} placeholder="HVAC filter check" />
            </Field>
            <Field label="Team">
              <select name="team" defaultValue={s?.team ?? teams[0]}>
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {TEAM_NAME[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="How often">
              <select name="frequency" defaultValue={s?.frequency ?? "monthly"}>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </select>
            </Field>
            <DateField name="next" label={s ? "Next date" : "First date"} defaultValue={s?.next ?? today} min={s ? undefined : today} required />
            <Field label="Where" required>
              <input name="room" list="ticket-locations" defaultValue={s?.room} required maxLength={120} />
            </Field>
            <Field label="Equipment (optional)">
              <input name="equipment" defaultValue={s?.equipment} maxLength={120} />
            </Field>
            <Field label="Urgency">
              <select name="urgency" defaultValue={s?.urgency ?? "normal"}>
                {URGENCIES.map((u) => (
                  <option key={u} value={u}>
                    {URGENCY[u].label}
                  </option>
                ))}
              </select>
            </Field>
            <PeoplePicker name="assignee" label="Give each ticket to" hint="Leave empty and it goes to the team. Pick someone on the schedule's team." people={people} defaultValue={s?.assigneeEmail ?? null} />
          </div>
          <datalist id="ticket-locations">
            {locations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <Field label="What to do (copied onto each ticket)">
            <textarea name="description" rows={3} defaultValue={s?.description} maxLength={3000} placeholder="Inspect and replace the filters on both rooftop units." />
          </Field>
          <FormActions sticky={false}>
            <Button variant="primary" type="submit">
              {s ? "Save" : "Add schedule"}
            </Button>
            <Button href="/it-maintenance/schedules" variant="quiet">
              Cancel
            </Button>
          </FormActions>
        </form>
      </Panel>
    );
  }
}
