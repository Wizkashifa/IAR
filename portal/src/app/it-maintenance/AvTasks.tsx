import { Disclosure } from "@/components/Disclosure";
import { EmptyState } from "@/components/EmptyState";
import { Rows } from "@/components/ItemRow";
import { Panel } from "@/components/Panel";
import { cardStore } from "@/lib/cards";
import { emailsIn } from "@/lib/card-row";
import { eventContext } from "@/lib/events/context";
import { lockedCount, queueItems, recentlyDone, type QueueItem } from "@/lib/events/queues";
import { isEventCard } from "@/lib/events/workflow";
import { queueTeamMembers } from "@/lib/groups";
import { nameResolver, peopleOptions } from "@/lib/names";
import type { Role } from "@/lib/org";
import { EventTaskRow } from "../events/ops-ui";

/**
 * "A/V for events" on Team tickets: A/V's open tasks from approved events,
 * soonest due first, with their buttons, as Team work lists marketing's.
 * `back` is where the buttons return to.
 */
export async function AvTasks({ email, roles, back }: { email: string; roles: Role[]; back: string }) {
  const store = await cardStore();
  const [ctx, events, members] = await Promise.all([eventContext(), store.listByType("event", ["submitted", "in_review", "approved", "close_out"]), queueTeamMembers("av")]);
  const cards = events.filter(isEventCard);
  const open = queueItems(cards, "av", ctx.today);
  const done = recentlyDone(cards, "av", 8);
  const locked = lockedCount(cards, "av");
  const tasks = [...open, ...done];
  const names = await nameResolver([...emailsIn(tasks.map((t) => t.card)), ...tasks.flatMap((t) => (t.task.assignee ? [t.task.assignee] : [])), ...members]);
  const people = peopleOptions(members, email, names);
  const row = (item: QueueItem, withButtons: boolean) => (
    <EventTaskRow key={`${item.card.id}-${item.task.id}`} item={item} withButtons={withButtons} names={names} rooms={ctx.rooms} email={email} roles={roles} back={back} people={people} />
  );

  return (
    <>
      <Panel title="A/V for events" right={<span>{open.length} open</span>} flush>
        {open.length === 0 ? <EmptyState>Nothing open for A/V. New tasks show up here when an event that needs A/V is approved.</EmptyState> : <Rows>{open.map((q) => row(q, true))}</Rows>}
      </Panel>
      {locked > 0 && (
        <p className="hint">
          {locked} more A/V task{locked === 1 ? " is" : "s are"} waiting on events still in review, and will show up here once they&apos;re approved.
        </p>
      )}
      {done.length > 0 && (
        <Disclosure summary={`A/V recently done (${done.length})`}>
          <Panel flush>
            <Rows>{done.map((q) => row(q, false))}</Rows>
          </Panel>
        </Disclosure>
      )}
    </>
  );
}
