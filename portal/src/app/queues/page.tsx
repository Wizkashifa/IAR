import Link from "next/link";
import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { ItemList, rowsFor } from "@/components/ItemList";
import { ItemRow, Rows } from "@/components/ItemRow";
import { HelpBox } from "@/components/HelpBox";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { Pill, type Tone } from "@/components/Pill";
import { cardStore, type Card } from "@/lib/cards";
import { emailsIn } from "@/lib/card-row";
import { eventContext } from "@/lib/events/context";
import { lockedCount, marketingQueue, nearTerm, queueItems, queueTeamsFor, recentlyDone, type QueueItem } from "@/lib/events/queues";
import { roomById } from "@/lib/events/rooms";
import { dayText, timeText } from "@/lib/events/series";
import { TASK_STATUS_LABEL, TEAM_NAME } from "@/lib/events/tasks";
import type { EventTask, TaskTeam } from "@/lib/events/types";
import { isEventCard } from "@/lib/events/workflow";
import { nameResolver } from "@/lib/names";
import { actorFor } from "@/lib/people";
import { requireViewer } from "@/lib/viewer";
import { needsContext } from "@/lib/waiting";
import { fmtDay } from "@/lib/format";
import { TaskButtons } from "../events/ops-ui";
import { addDays } from "@/lib/dates";
import { Disclosure } from "@/components/Disclosure";
import { Chips } from "@/components/Chips";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team Queues" };

const MESSAGES: Record<string, string> = {
  "task-taken": "It's yours. It shows your name on the event.",
  "task-started": "Marked in progress.",
  "task-done": "Marked done. The requester can see it on the event.",
  "task-asked": "Question sent. It's a comment on the event, and the requester gets an alert.",
};

const TASK_TONE: Record<EventTask["status"], Tone> = { locked: "neutral", todo: "info", doing: "warn", done: "ok" };

export default async function QueuesPage({ searchParams }: { searchParams: Promise<{ team?: string; all?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const teams = queueTeamsFor(viewer.actingRoles, viewer.roles.includes("admins"));
  const head = <ModuleHead title="Team Queues" lead="Your team's open tasks across every approved event, soonest due first. Tasks unlock when an event is approved." />;
  if (!teams.length) {
    return (
      <div className="stack">
        {head}
        <Panel>
          <EmptyState icon="tasks">
            You&apos;re not on a team that gets event tasks (Marketing, IT Services, Facility Maintenance or Safety &amp; Security). The IAR office sees every queue.
          </EmptyState>
        </Panel>
      </div>
    );
  }
  const team: TaskTeam = teams.includes(sp.team as TaskTeam) ? (sp.team as TaskTeam) : teams[0];
  const store = await cardStore();
  const ctx = await eventContext();
  const [events, marketing, actor, needs] = await Promise.all([
    store.listByType("event", ["submitted", "in_review", "approved", "close_out"]),
    team === "marketing" ? store.listByType("marketing", ["approved"]) : Promise.resolve([] as Card[]),
    actorFor(viewer),
    needsContext(),
  ]);
  const cards = events.filter(isEventCard);
  const allOpen = queueItems(cards, team, ctx.today);
  // Two weeks ahead by default, so a weekly series doesn't bury the rest.
  const horizon = addDays(ctx.today, 14);
  const open = sp.all ? allOpen : nearTerm(allOpen, horizon);
  const later = allOpen.length - open.length;
  const done = recentlyDone(cards, team, 8);
  const locked = lockedCount(cards, team);
  const mk = marketingQueue(marketing);
  const back = `/queues?team=${team}`;
  const roomNames = (ids: string[]) => ids.map((r) => roomById(ctx.rooms, r)?.name ?? r).join(", ") || "Off-site";
  const tasks = [...open, ...done];
  const names = await nameResolver([...emailsIn([...tasks.map((t) => t.card), ...mk]), ...tasks.flatMap((t) => (t.task.assignee ? [t.task.assignee] : []))]);

  const row = ({ card, task, overdue }: QueueItem, withButtons: boolean) => (
    <ItemRow
      key={`${card.id}-${task.id}`}
      title={<Link href={`/events/${card.id}#tasks`}>{task.title}</Link>}
      id={card.id}
      sub={
        <>
          {card.title} · {card.event.committeeName} · {roomNames(card.event.rooms)} · {task.date ? dayText(task.date) : dayText(card.event.dates[0] ?? card.event.date)}
          {card.event.dates.length > 1 && !task.date ? ` (series, ${card.event.dates.length} dates)` : ""}, {timeText(card.event.start)}–{timeText(card.event.end)} · from {names(card.ownerEmail)}
        </>
      }
      who={task.status === "done" ? (task.note ? `“${task.note}”` : undefined) : `${task.team === "marketing" ? "Start marketing" : "Due"} ${fmtDay(task.dueDate)} · ${task.assignee ? names(task.assignee) : "nobody yet"}`}
      state={task.status === "done" ? "done" : overdue ? "bad" : task.assignee?.toLowerCase() === viewer.email.toLowerCase() || !task.assignee ? "act" : "wait"}
      right={
        <>
          <Pill tone={overdue ? "bad" : TASK_TONE[task.status]} dot>
            {overdue ? "Overdue" : TASK_STATUS_LABEL[task.status]}
          </Pill>
          {withButtons && <TaskButtons card={card} task={task} roles={viewer.actingRoles} email={viewer.email} back={back} />}
        </>
      }
    />
  );

  return (
    <div className="stack">
      {head}
      <HelpBox module="teams" />
      {sp.error &&<Note tone="bad">{sp.error}</Note>}
      {sp.ok && MESSAGES[sp.ok] && <Note tone="ok">{MESSAGES[sp.ok]}</Note>}

      {teams.length > 1 && (
        <Chips label="Team" chips={teams.map((t) => ({ label: TEAM_NAME[t], href: `/queues?team=${t}`, on: t === team, count: queueItems(cards, t, ctx.today).length }))} />
      )}

      <Panel title={`${TEAM_NAME[team]}: open tasks`} right={<span>{allOpen.length} open</span>} flush>
        {allOpen.length === 0 ? (
          <EmptyState icon="tasks">Nothing open for {TEAM_NAME[team]}. New tasks show up here when an event is approved.</EmptyState>
        ) : (
          <Rows>{open.map((q) => row(q, true))}</Rows>
        )}
      </Panel>

      {later > 0 && (
        <p className="hint">
          {later} more for later dates of a series. <Link href={`/queues?team=${team}&all=1`}>Show all</Link>
        </p>
      )}
      {locked > 0 && (
        <p className="hint">
          {locked} more {TEAM_NAME[team]} task{locked === 1 ? " is" : "s are"} waiting on events still in review, and will show up here once they&apos;re approved.
        </p>
      )}

      {team === "marketing" && (
        <ItemList
          title="Marketing requests"
          rows={rowsFor(mk, actor, { names, today: ctx.today, ctx: needs })}
          empty={
            <>
              No marketing requests scheduled right now. New ones wait for the weekly review in <Link href="/marketing">Marketing Requests</Link>.
            </>
          }
        />
      )}

      {done.length > 0 && (
        <Disclosure summary={`Recently done (${done.length})`}>
          <Panel flush>
            <Rows>{done.map((q) => row(q, false))}</Rows>
          </Panel>
        </Disclosure>
      )}
    </div>
  );
}
