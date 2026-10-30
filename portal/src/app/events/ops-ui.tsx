import Link from "next/link";
import { Button } from "@/components/Button";
import { Pill, type Tone } from "@/components/Pill";
import type { NameOf } from "@/lib/steps";
import type { Role } from "@/lib/org";
import { dayText } from "@/lib/events/series";
import { TASK_STATUS_LABEL, TEAM_NAME, worksTeam } from "@/lib/events/tasks";
import type { EventTask } from "@/lib/events/types";
import type { EventCard } from "@/lib/events/workflow";
import { workOnTask } from "./ops-actions";
import { ItemRow } from "@/components/ItemRow";
import { Disclosure } from "@/components/Disclosure";
import { Field } from "@/components/Field";
import { PeoplePicker, type PersonOption } from "@/components/PeoplePicker";

/** Pieces Team Queues and the event page share. */

const TASK_TONE: Record<EventTask["status"], Tone> = { locked: "neutral", todo: "info", doing: "warn", done: "ok" };

export function TaskPill({ task, overdue }: { task: EventTask; overdue?: boolean }) {
  return (
    <Pill tone={overdue ? "bad" : TASK_TONE[task.status]} status={task.status !== "locked"}>
      {overdue ? "Overdue" : TASK_STATUS_LABEL[task.status]}
    </Pill>
  );
}

/** The buttons for one task, for someone on its team (or the office). `people`: who on its team it can be handed to. */
export function TaskButtons({ card, task, roles, email, back, people = [] }: { card: EventCard; task: EventTask; roles: Role[]; email: string; back: string; people?: PersonOption[] }) {
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
    <div className="row end noprint">
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
            <Field label="Note for the requester (optional)">
              <input name="note" maxLength={1000} placeholder={task.team === "marketing" ? "e.g. Flyer posted; link to the listing" : "e.g. Set up and tested"} />
        </Field>
            <div><Button size="small" type="submit">Done{mine || !task.assignee ? "" : ` (for ${task.assignee})`}</Button></div>
          </form>
        </Disclosure>
      )}
      {task.status !== "done" && people.some((p) => p.email !== task.assignee?.toLowerCase()) && (
        <Disclosure summary={task.assignee ? "Hand to someone else" : "Give to someone"} button="quiet">
          <form action={workOnTask} className="stack">
            {base}
            <input type="hidden" name="step" value="assign" />
            <PeoplePicker name="assignee" label={`Who on ${TEAM_NAME[task.team]} should have it`} required people={people.filter((p) => p.email !== task.assignee?.toLowerCase())} />
            <div><Button size="small" type="submit">Hand it over</Button></div>
          </form>
        </Disclosure>
      )}
      <Disclosure summary="Ask the requester" button="quiet">
        <form action={workOnTask} className="stack">
          {base}
          <input type="hidden" name="step" value="ask" />
          <Field label="Your question (added as a comment on the event; the requester gets an alert)">
            <textarea name="note" rows={2} maxLength={1000} required />
        </Field>
          <div><Button size="small" type="submit">Send question</Button></div>
        </form>
      </Disclosure>
    </div>
  );
}

/** One task, as a line on the event page. `names` shows who has it by name. */
export function TaskLine({ card, task, roles, email, back, today, names, people }: { card: EventCard; task: EventTask; roles: Role[]; email: string; back: string; today: string; names?: NameOf; people?: PersonOption[] }) {
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
          <TaskButtons card={card} task={task} roles={roles} email={email} back={back} people={people} />
        </>
      }
    />
  );
}

export const eventLink = (card: EventCard) => <Link href={`/events/${card.id}`}>{card.title}</Link>;
