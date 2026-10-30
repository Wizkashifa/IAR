import { Disclosure } from "@/components/Disclosure";
import { EmptyState } from "@/components/EmptyState";
import { Rows } from "@/components/ItemRow";
import { Panel } from "@/components/Panel";
import { cardStore } from "@/lib/cards";
import { emailsIn } from "@/lib/card-row";
import { eventContext } from "@/lib/events/context";
import { queueItems, recentlyDone, type QueueItem } from "@/lib/events/queues";
import { avComing } from "@/lib/tickets/event-av";
import { isEventCard } from "@/lib/events/workflow";
import { queueTeamMembers } from "@/lib/groups";
import { nameResolver, peopleOptions } from "@/lib/names";
import type { Role } from "@/lib/org";
import { EventTaskRow } from "../events/ops-ui";

/**
 * "A/V for events" on Team tickets: the A/V tasks older events still have,
 * soonest due first, with their buttons. New events bring A/V tickets
 * instead, on the board like any ticket; once the older tasks are done, only
 * the line about events in review that will bring tickets stays.
 * `back` is where the buttons return to.
 */
export async function AvTasks({ email, roles, back }: { email: string; roles: Role[]; back: string }) {
  const store = await cardStore();
  const [ctx, events, members] = await Promise.all([eventContext(), store.listByType("event", ["submitted", "in_review", "approved", "close_out"]), queueTeamMembers("av")]);
  const cards = events.filter(isEventCard);
  const open = queueItems(cards, "av", ctx.today);
  const done = recentlyDone(cards, "av", 8);
  const coming = avComing(cards);
  const tasks = [...open, ...done];
  const names = await nameResolver([...emailsIn(tasks.map((t) => t.card)), ...tasks.flatMap((t) => (t.task.assignee ? [t.task.assignee] : [])), ...members]);
  const people = peopleOptions(members, email, names);
  const row = (item: QueueItem, withButtons: boolean) => (
    <EventTaskRow key={`${item.card.id}-${item.task.id}`} item={item} withButtons={withButtons} names={names} rooms={ctx.rooms} email={email} roles={roles} back={back} people={people} />
  );

  const comingLine = coming > 0 && (
    <p className="hint">
      {coming} event{coming === 1 ? "" : "s"} in review asked for A/V. Each brings an A/V ticket per date once it&apos;s approved.
    </p>
  );
  if (open.length === 0 && done.length === 0) return comingLine || null;

  return (
    <>
      <Panel title="A/V for events" right={<span>{open.length} open</span>} flush>
        {open.length === 0 ? <EmptyState>Nothing open from older events. New events bring A/V tickets, on the board below.</EmptyState> : <Rows>{open.map((q) => row(q, true))}</Rows>}
      </Panel>
      {comingLine}
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
