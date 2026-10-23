import Link from "next/link";
import type { Role } from "@/lib/org";
import { WHEN_LABEL, mayCheckRooms } from "@/lib/events/roomchecks";
import { dayText } from "@/lib/events/series";
import { TASK_STATUS_LABEL, TEAM_NAME, worksTeam } from "@/lib/events/tasks";
import type { EventTask, RoomCheck } from "@/lib/events/types";
import type { EventCard } from "@/lib/events/workflow";
import { saveRoomCheck, workOnTask } from "./ops-actions";

/** Pieces Team Queues, the run sheet and the event page share. */

export function TaskPill({ task, overdue }: { task: EventTask; overdue?: boolean }) {
  return <span className={`pill task-${task.status}${overdue ? " late" : ""}`}>{overdue ? "Overdue" : TASK_STATUS_LABEL[task.status]}</span>;
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
          <button className="button secondary small" type="submit">Take it</button>
        </form>
      )}
      {task.status === "todo" && (
        <form action={workOnTask}>
          {base}
          <input type="hidden" name="step" value="start" />
          <button className="button secondary small" type="submit">Start</button>
        </form>
      )}
      {task.status !== "done" && (
        <details className="taskmore">
          <summary className="button small">Mark done</summary>
          <form action={workOnTask} className="stack">
            {base}
            <input type="hidden" name="step" value="done" />
            <label className="field">
              <span>Note for the requester (optional)</span>
              <input name="note" maxLength={1000} placeholder={task.team === "marketing" ? "e.g. Flyer posted; link to the listing" : "e.g. Set up and tested"} />
            </label>
            <div><button className="button small" type="submit">Done{mine || !task.assignee ? "" : ` (for ${task.assignee})`}</button></div>
          </form>
        </details>
      )}
      <details className="taskmore">
        <summary className="linkbtn">Ask the requester</summary>
        <form action={workOnTask} className="stack">
          {base}
          <input type="hidden" name="step" value="ask" />
          <label className="field">
            <span>Your question (added as a comment on the event; the requester gets an alert)</span>
            <textarea name="note" rows={2} maxLength={1000} required />
          </label>
          <div><button className="button secondary small" type="submit">Send question</button></div>
        </form>
      </details>
    </div>
  );
}

/** One task, as a line on the event page. */
export function TaskLine({ card, task, roles, email, back, today }: { card: EventCard; task: EventTask; roles: Role[]; email: string; back: string; today: string }) {
  const overdue = (task.status === "todo" || task.status === "doing") && task.dueDate < today;
  return (
    <li className="task">
      <div>
        <div>{task.title}</div>
        <div className="sub">
          {TEAM_NAME[task.team]} · due {dayText(task.dueDate)}
          {task.assignee ? ` · ${task.assignee}` : ""}
          {task.note ? ` · “${task.note}”` : ""}
        </div>
      </div>
      <div className="taskside">
        <TaskPill task={task} overdue={overdue} />
        <TaskButtons card={card} task={task} roles={roles} email={email} back={back} />
      </div>
    </li>
  );
}

export function CheckResult({ check }: { check?: RoomCheck }) {
  if (!check) return <span className="sub">Not recorded</span>;
  return (
    <span className={`check ${check.ok ? "ok" : "bad"}`}>
      {check.ok ? "OK" : "Problem"}
      {check.note ? `: ${check.note}` : ""}
      <span className="sub"> · {check.by}</span>
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
        <details className="taskmore noprint">
          <summary className="linkbtn">{check ? "Change" : "Record"}</summary>
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
            <div><button className="button small" type="submit">Save check</button></div>
          </form>
        </details>
      )}
    </div>
  );
}

export const eventLink = (card: EventCard) => <Link href={`/events/${card.id}`}>{card.title}</Link>;
