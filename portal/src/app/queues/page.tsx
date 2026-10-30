import Link from "next/link";
import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { Rows } from "@/components/ItemRow";
import { HelpBox } from "@/components/HelpBox";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { cardStore } from "@/lib/cards";
import { emailsIn } from "@/lib/card-row";
import { eventContext } from "@/lib/events/context";
import { lockedCount, nearTerm, queueItems, queueTeamsFor, recentlyDone, type QueueItem } from "@/lib/events/queues";
import { TEAM_NAME } from "@/lib/events/tasks";
import type { TaskTeam } from "@/lib/events/types";
import { isEventCard } from "@/lib/events/workflow";
import { nameResolver } from "@/lib/names";
import { queueTeamMembers } from "@/lib/groups";
import { requireViewer } from "@/lib/viewer";
import { EventTaskRow } from "../events/ops-ui";
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
  "task-assigned": "Handed over. They get an alert, and their name shows on the event.",
};

export default async function QueuesPage({ searchParams }: { searchParams: Promise<{ team?: string; all?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  // Admins and executives see every queue; only the teams themselves (and the office) work them.
  const teams = queueTeamsFor(viewer.actingRoles, viewer.roles.includes("admins") || viewer.roles.includes("executive"));
  const head = <ModuleHead title="Team Queues" lead="Your team's open tasks across every approved event, soonest due first. Tasks unlock when an event is approved." />;
  if (!teams.length) {
    return (
      <div className="stack">
        {head}
        <Panel>
          <EmptyState>
            You&apos;re not on a team that gets event tasks (Marketing, or IT Services for A/V). The IAR office sees every queue.
          </EmptyState>
        </Panel>
      </div>
    );
  }
  const team: TaskTeam = teams.includes(sp.team as TaskTeam) ? (sp.team as TaskTeam) : teams[0];
  const store = await cardStore();
  const ctx = await eventContext();
  const [events, members] = await Promise.all([store.listByType("event", ["submitted", "in_review", "approved", "close_out"]), queueTeamMembers(team)]);
  const cards = events.filter(isEventCard);
  const allOpen = queueItems(cards, team, ctx.today);
  // Two weeks ahead by default, so a weekly series doesn't bury the rest.
  const horizon = addDays(ctx.today, 14);
  const open = sp.all ? allOpen : nearTerm(allOpen, horizon);
  const later = allOpen.length - open.length;
  const done = recentlyDone(cards, team, 8);
  const locked = lockedCount(cards, team);
  const back = `/queues?team=${team}`;
  const tasks = [...open, ...done];
  const names = await nameResolver([...emailsIn(tasks.map((t) => t.card)), ...tasks.flatMap((t) => (t.task.assignee ? [t.task.assignee] : [])), ...members]);
  // Who on the team a task can be handed to.
  const people = members.map((m) => ({ email: m, name: m === viewer.email.toLowerCase() ? `Me (${names(m)})` : names(m) }));

  const row = (item: QueueItem, withButtons: boolean) => (
    <EventTaskRow key={`${item.card.id}-${item.task.id}`} item={item} withButtons={withButtons} names={names} rooms={ctx.rooms} email={viewer.email} roles={viewer.actingRoles} back={back} people={people} />
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

      {team === "marketing" ? (
        <Panel>
          <EmptyState title="Marketing works from Marketing Requests">
            Event marketing and marketing requests are in one list now, newest first: <Link href="/marketing?view=team">Marketing Requests → Team work</Link>.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <Panel title={`${TEAM_NAME[team]}: open tasks`} right={<span>{allOpen.length} open</span>} flush>
            {allOpen.length === 0 ? (
              <EmptyState>Nothing open for {TEAM_NAME[team]}. New tasks show up here when an event is approved.</EmptyState>
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

          {done.length > 0 && (
            <Disclosure summary={`Recently done (${done.length})`}>
              <Panel flush>
                <Rows>{done.map((q) => row(q, false))}</Rows>
              </Panel>
            </Disclosure>
          )}
        </>
      )}
    </div>
  );
}
