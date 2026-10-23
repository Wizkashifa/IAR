import Link from "next/link";
import { cardStore, type Card } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { eventContext } from "@/lib/events/context";
import { lockedCount, marketingQueue, nearTerm, queueItems, queueTeamsFor, recentlyDone } from "@/lib/events/queues";
import { roomById } from "@/lib/events/rooms";
import { addDays, dayText, timeText } from "@/lib/events/series";
import { TEAM_NAME } from "@/lib/events/tasks";
import type { TaskTeam } from "@/lib/events/types";
import { isEventCard } from "@/lib/events/workflow";
import { Flash, fmtDay } from "../ui";
import { TaskButtons, TaskPill } from "../events/ops-ui";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  "task-taken": "It's yours. It shows your name on the event.",
  "task-started": "Marked in progress.",
  "task-done": "Marked done. The requester can see it on the event.",
  "task-asked": "Question sent. It's a comment on the event, and the requester gets an alert.",
};

const MK_STAGE: Record<string, string> = { scheduled: "Scheduled", doing: "In progress" };

export default async function QueuesPage({ searchParams }: { searchParams: Promise<{ team?: string; all?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const teams = queueTeamsFor(viewer.actingRoles, viewer.roles.includes("admins"));
  if (!teams.length) {
    return (
      <>
        <h1>Team Queues</h1>
        <div className="panel empty">You&apos;re not on a team that gets event tasks (Marketing, IT Services, Facility Maintenance or Safety &amp; Security). The IAR office sees every queue.</div>
      </>
    );
  }
  const team: TaskTeam = teams.includes(sp.team as TaskTeam) ? (sp.team as TaskTeam) : teams[0];
  const store = await cardStore();
  const ctx = await eventContext();
  const [events, marketing] = await Promise.all([
    store.listByType("event", ["submitted", "in_review", "approved", "close_out"]),
    team === "marketing" ? store.listByType("marketing", ["approved"]) : Promise.resolve([] as Card[]),
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

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Team Queues</h1>
          <p className="lead">Your team&apos;s open tasks across every approved event, soonest due first. Tasks unlock when an event is approved.</p>
        </div>
      </div>
      <Flash ok={sp.ok} error={sp.error} messages={MESSAGES} />

      {teams.length > 1 && (
        <div className="filters">
          {teams.map((t) => (
            <Link key={t} href={`/queues?team=${t}`} className={`filter${t === team ? " on" : ""}`}>
              {TEAM_NAME[t]}<span>{queueItems(cards, t, ctx.today).length}</span>
            </Link>
          ))}
        </div>
      )}

      <h2>{TEAM_NAME[team]}: open tasks ({allOpen.length})</h2>
      {allOpen.length === 0 ? (
        <div className="panel empty">Nothing open for {TEAM_NAME[team]}. New tasks show up here when an event is approved.</div>
      ) : (
        <ul className="queue">
          {open.map(({ card, task, overdue }) => (
            <li key={`${card.id}-${task.id}`} className="qitem">
              <div className="qmain">
                <div><strong>{task.title}</strong></div>
                <div className="sub">
                  <Link href={`/events/${card.id}#tasks`}>{card.title}</Link> · {card.id} · {card.event.committeeName} · {roomNames(card.event.rooms)}
                </div>
                <div className="sub">
                  Event {task.date ? dayText(task.date) : dayText(card.event.dates[0] ?? card.event.date)}{card.event.dates.length > 1 && !task.date ? ` (series, ${card.event.dates.length} dates)` : ""}, {timeText(card.event.start)}–{timeText(card.event.end)}
                  {" · "}
                  <span className={overdue ? "late" : ""}>{task.team === "marketing" ? "start marketing" : "due"} {fmtDay(task.dueDate)}</span>
                  {task.assignee ? ` · ${task.assignee}` : " · nobody yet"}
                  {" · "}requester {card.ownerEmail}
                </div>
              </div>
              <div className="taskside">
                <TaskPill task={task} overdue={overdue} />
                <TaskButtons card={card} task={task} roles={viewer.actingRoles} email={viewer.email} back={back} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {later > 0 && (
        <p className="note">
          {later} more for later dates of a series. <Link href={`/queues?team=${team}&all=1`}>Show all</Link>
        </p>
      )}
      {locked > 0 &&<p className="note">{locked} more {TEAM_NAME[team]} task{locked === 1 ? " is" : "s are"} waiting on events still in review, and will show up here once they&apos;re approved.</p>}

      {team === "marketing" && (
        <>
          <h2>Marketing requests ({mk.length})</h2>
          <p className="note">Scheduled and in-progress requests that aren&apos;t tied to an event. New ones wait for the weekly review in <Link href="/marketing">Marketing Requests</Link>.</p>
          {mk.length === 0 ? (
            <div className="panel empty">No marketing requests scheduled right now.</div>
          ) : (
            <ul className="queue">
              {mk.map((c) => (
                <li key={c.id} className="qitem">
                  <div className="qmain">
                    <div><Link href={`/marketing/${c.id}`}><strong>{c.title}</strong></Link></div>
                    <div className="sub">
                      {c.id} · {c.committee}
                      {c.marketing?.doneBy ? <> · <span className={c.marketing.doneBy < ctx.today ? "late" : ""}>done by {fmtDay(c.marketing.doneBy)}</span></> : ""}
                      {c.marketing?.assignee ? ` · ${c.marketing.assignee}` : ""}
                    </div>
                  </div>
                  <div className="taskside">
                    <span className={`pill ${c.marketing?.stage === "doing" ? "task-doing" : "task-todo"}`}>{MK_STAGE[c.marketing?.stage ?? ""] ?? ""}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {done.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary><strong>Recently done ({done.length})</strong></summary>
          <ul className="queue">
            {done.map(({ card, task }) => (
              <li key={`${card.id}-${task.id}`} className="qitem">
                <div className="qmain">
                  <div>{task.title}</div>
                  <div className="sub"><Link href={`/events/${card.id}#tasks`}>{card.title}</Link> · {card.id}{task.assignee ? ` · ${task.assignee}` : ""}{task.note ? ` · “${task.note}”` : ""}</div>
                </div>
                <div className="taskside"><TaskPill task={task} /></div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
