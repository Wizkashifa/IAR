import Link from "next/link";
import { Button } from "@/components/Button";
import { Pill, type Tone } from "@/components/Pill";
import { type NameOf, fallbackName } from "@/lib/steps";
import type { Role } from "@/lib/org";
import { WHEN_LABEL, mayCheckRooms } from "@/lib/events/roomchecks";
import { dayText } from "@/lib/events/series";
import { TASK_STATUS_LABEL, TEAM_NAME, worksTeam } from "@/lib/events/tasks";
import type { EventTask, RoomCheck } from "@/lib/events/types";
import type { EventCard } from "@/lib/events/workflow";
import { saveRoomCheck, workOnTask } from "./ops-actions";
import { ItemRow } from "@/components/ItemRow";
import { Disclosure } from "@/components/Disclosure";

/** Pieces Team Queues, the run sheet and the event page share. */

const TASK_TONE: Record<EventTask["status"], Tone> = { locked: "neutral", todo: "info", doing: "warn", done: "ok" };

export function TaskPill({ task, overdue }: { task: EventTask; overdue?: boolean }) {
  return (
    <Pill tone={overdue ? "bad" : TASK_TONE[task.status]} dot={task.status !== "locked"}>
      {overdue ? "Overdue" : TASK_STATUS_LABEL[task.status]}
    </Pill>
  );
}

/** The buttons for one task, for someone on its team (or the office). */
export function TaskButtons({ card, task, roles, email, back }: { card: EventCard; task: EventTask; roles: Role[]; email: string; back: string }) {
  if (!worksTeam(task.team, roles) || task.status === "locked" || (card.status !== "approved" && card.status !== "close_out")) return null;
  const base = (
    <>
      <input type="hidden" name="id" value={card.id} />
      <input type="hidden" name="task" value={task.id} />
      <input type="hidden" name="back" value={back} />
    </>
  );
  const mine = task.assignee?.toLowerCase() === email.toLowerCase();
  return (
    <div className="taskacts noprint">
      {/* One form per button: each carries its own step. */}
      {task.status !== "done" && !task.assignee && (
        <form action={workOnTask}>
          {base}
          <input type="hidden" name="step" value="take" />
          <Button size="small" type="submit">Take it</Button>
        </form>
      )}
      {task.status === "todo" && (
        <form action={workOnTask}>
          {base}
          <input type="hidden" name="step" value="start" />
          <Button size="small" type="submit">Start</Button>
        </form>
      )}
      {task.status !== "done" && (
        <Disclosure summary="Mark done" button="primary">
          <form action={workOnTask} className="stack">
            {base}
            <input type="hidden" name="step" value="done" />
            <label className="field">
              <span>Note for the requester (optional)</span>
              <input name="note" maxLength={1000} placeholder={task.team === "marketing" ? "e.g. Flyer posted; link to the listing" : "e.g. Set up and tested"} />
            </label>
            <div><Button size="small" type="submit">Done{mine || !task.assignee ? "" : ` (for ${task.assignee})`}</Button></div>
          </form>
        </Disclosure>
      )}
      <Disclosure summary="Ask the requester" button="quiet">
        <form action={workOnTask} className="stack">
          {base}
          <input type="hidden" name="step" value="ask" />
          <label className="field">
            <span>Your question (added as a comment on the event; the requester gets an alert)</span>
            <textarea name="note" rows={2} maxLength={1000} required />
          </label>
          <div><Button size="small" type="submit">Send question</Button></div>
        </form>
      </Disclosure>
    </div>
  );
}

/** One task, as a line on the event page. `names` shows who has it by name. */
export function TaskLine({ card, task, roles, email, back, today, names }: { card: EventCard; task: EventTask; roles: Role[]; email: string; back: string; today: string; names?: NameOf }) {
  const overdue = (task.status === "todo" || task.status === "doing") && task.dueDate < today;
  const who = task.assignee ? (names ? names(task.assignee) : task.assignee) : "";
  return (
    <ItemRow
      state="plain"
      title={task.title}
      sub={`${TEAM_NAME[task.team]} · due ${dayText(task.dueDate)}${who ? ` · ${who}` : ""}${task.note ? ` · “${task.note}”` : ""}`}
      right={
        <>
          <TaskPill task={task} overdue={overdue} />
          <TaskButtons card={card} task={task} roles={roles} email={email} back={back} />
        </>
      }
    />
  );
}

export function CheckResult({ check }: { check?: RoomCheck }) {
  if (!check) return <span className="sub">Not recorded</span>;
  return (
    <span>
      <Pill tone={check.ok ? "ok" : "bad"}>{check.ok ? "OK" : "Problem"}</Pill>
      {check.note ? ` ${check.note}` : ""}
      <span className="sub"> · {check.by.includes("@") ? fallbackName(check.by) : check.by}</span>
    </span>
  );
}

/** Security's before/after check for one date: the result, and a form to record it for security. */
export function RoomCheckCell({ card, date, when, check, roles, back }: { card: EventCard; date: string; when: RoomCheck["when"]; check?: RoomCheck; roles: Role[]; back: string }) {
  const can = mayCheckRooms({ roles }) && card.event.rooms.length > 0;
  return (
    <div className="roomcheck">
      <div><strong>{WHEN_LABEL[when]}:</strong> <CheckResult check={check} /></div>
      {can && (
        <Disclosure summary={check ? "Change" : "Record"} button="quiet" className="noprint">
          <form action={saveRoomCheck} className="stack">
            <input type="hidden" name="id" value={card.id} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="when" value={when} />
            <input type="hidden" name="back" value={back} />
            <div className="row">
              <label className="inline"><input type="radio" name="result" value="ok" defaultChecked={check?.ok !== false} required /> Room OK</label>
              <label className="inline"><input type="radio" name="result" value="problem" defaultChecked={check?.ok === false} /> Problem</label>
            </div>
            <label className="field">
              <span>Note (say what&apos;s wrong if there&apos;s a problem)</span>
              <input name="note" maxLength={1000} defaultValue={check?.note ?? ""} placeholder="e.g. Chairs left out, spill by the door" />
            </label>
            <div><Button size="small" type="submit">Save check</Button></div>
          </form>
        </Disclosure>
      )}
    </div>
  );
}

export const eventLink = (card: EventCard) => <Link href={`/events/${card.id}`}>{card.title}</Link>;
