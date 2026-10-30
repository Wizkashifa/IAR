import Link from "next/link";
import { Disclosure } from "@/components/Disclosure";
import { Rows } from "@/components/ItemRow";
import { Panel, PanelFoot } from "@/components/Panel";
import { cardStore } from "@/lib/cards";
import { emailsIn } from "@/lib/card-row";
import { addDays } from "@/lib/dates";
import { eventContext } from "@/lib/events/context";
import { lockedCount, nearTerm, queueItems, recentlyDone, type QueueItem } from "@/lib/events/queues";
import { isEventCard } from "@/lib/events/workflow";
import { queueTeamMembers } from "@/lib/groups";
import { nameResolver } from "@/lib/names";
import type { Role } from "@/lib/org";
import { EventTaskRow } from "../events/ops-ui";

/**
 * "A/V for events" on Team tickets: A/V's open tasks from approved events,
 * soonest due first, with their buttons. Two weeks ahead by default, plus the
 * next date of each series, so a weekly series doesn't bury the rest.
 * `back` is where the buttons return to; `allHref` shows everything.
 */
export async function AvTasks({ email, roles, all, back, allHref }: { email: string; roles: Role[]; all: boolean; back: string; allHref: string }) {
  const store = await cardStore();
  const [ctx, events, members] = await Promise.all([eventContext(), store.listByType("event", ["submitted", "in_review", "approved", "close_out"]), queueTeamMembers("av")]);
  const cards = events.filter(isEventCard);
  const allOpen = queueItems(cards, "av", ctx.today);
  const open = all ? allOpen : nearTerm(allOpen, addDays(ctx.today, 14));
  const later = allOpen.length - open.length;
  const done = recentlyDone(cards, "av", 8);
  const locked = lockedCount(cards, "av");
  const tasks = [...open, ...done];
  const names = await nameResolver([...emailsIn(tasks.map((t) => t.card)), ...tasks.flatMap((t) => (t.task.assignee ? [t.task.assignee] : [])), ...members]);
  // Who on A/V a task can be handed to.
  const people = members.map((m) => ({ email: m, name: m === email.toLowerCase() ? `Me (${names(m)})` : names(m) }));
  const row = (item: QueueItem, withButtons: boolean) => (
    <EventTaskRow key={`${item.card.id}-${item.task.id}`} item={item} withButtons={withButtons} names={names} rooms={ctx.rooms} email={email} roles={roles} back={back} people={people} />
  );
  const foot = later > 0 || locked > 0 || done.length > 0;

  return (
    <Panel title="A/V for events" right={<span>{allOpen.length} open</span>} flush>
      {allOpen.length === 0 ? (
        <PanelFoot>Nothing open for A/V. New tasks show up here when an event that needs A/V is approved.</PanelFoot>
      ) : (
        <Rows>{open.map((q) => row(q, true))}</Rows>
      )}
      {foot && (
        <PanelFoot>
          {later > 0 && (
            <p>
              {later} more for later dates of a series. <Link href={allHref}>Show all</Link>
            </p>
          )}
          {locked > 0 && (
            <p>
              {locked} more A/V task{locked === 1 ? " is" : "s are"} waiting on events still in review, and will show up here once they&apos;re approved.
            </p>
          )}
          {done.length > 0 && (
            <Disclosure summary={`Recently done (${done.length})`}>
              <Rows>{done.map((q) => row(q, false))}</Rows>
            </Disclosure>
          )}
        </PanelFoot>
      )}
    </Panel>
  );
}
