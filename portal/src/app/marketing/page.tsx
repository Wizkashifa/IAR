import type { Metadata } from "next";
import { cardStore, type CardStatus } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { actorFor } from "@/lib/people";
import { todayLocal } from "@/lib/dates";
import { nameResolver, peopleOptions } from "@/lib/names";
import { emailsIn, type RowData } from "@/lib/card-row";
import { groupForViewer } from "@/lib/needs-you";
import { OPEN_STAGES, isMarketingCard, reviewableBy, type MarketingCard } from "@/lib/marketing/workflow";
import { FEED_FILTERS, byEvent, eventOf, feedFilter, marketingFeed, type FeedEvent, type FeedItem } from "@/lib/marketing/feed";
import { EVENT_NOT_APPROVED, waitsOnEvent } from "@/lib/marketing/linked";
import { dayText } from "@/lib/events/series";
import { eventContext } from "@/lib/events/context";
import { queueItems, recentlyDone } from "@/lib/events/queues";
import { firstDate, isEventCard, type EventCard } from "@/lib/events/workflow";
import { queueTeamMembers } from "@/lib/groups";
import { Button } from "@/components/Button";
import { Chips } from "@/components/Chips";
import { Disclosure } from "@/components/Disclosure";
import { EmptyState } from "@/components/EmptyState";
import { FlashNote } from "@/components/FlashNote";
import { ItemList, groupedRows, rowsFor, sectionsOf } from "@/components/ItemList";
import { CardRow, Rows } from "@/components/ItemRow";
import { HelpBox } from "@/components/HelpBox";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { Tabs } from "@/components/Tabs";
import Link from "next/link";
import { EventTaskRow, TASK_FLASH } from "../events/ops-ui";
import { OK_MESSAGES } from "./ui";
import styles from "./marketing.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing Requests" };

const OPEN: CardStatus[] = ["submitted", "changes_requested", "approved"];
const FINISHED: CardStatus[] = ["closed", "denied"];

type Search = { view?: string; f?: string; layout?: string; ok?: string; error?: string };

export default async function MarketingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const store = await cardStore();
  // The team's work, for whoever can open every request (lib/marketing/access.ts): the marketing team, the office and executives.
  const team = viewer.roles.some((r) => r === "marketing" || r === "office" || r === "executive");
  const onTeamTab = team && sp.view === "team";
  const today = todayLocal();

  const [actor, mineAll, openAll] = await Promise.all([actorFor(viewer), store.listByOwner(viewer.email), team ? store.listByType("marketing", OPEN) : Promise.resolve([])]);
  const mine = mineAll.filter(isMarketingCard);
  const open = openAll.filter(isMarketingCard);
  // New requests this person could pick up (not their own).
  const fresh = reviewableBy(open.filter((c) => c.marketing.stage === "review"), actor).length;

  const head = (
    <ModuleHead accent="mkt"
      title="Marketing Requests"
      lead="Graphics, signs, announcements, highlights, webpages, short links and staff badges."
      actions={
        <Button href="/marketing/new" variant="primary" icon="plus">
          New marketing request
        </Button>
      }
    />
  );
  const tabs = team && (
    <Tabs
      label="Marketing Requests views"
      tabs={[
        { label: "Your requests", href: "/marketing", on: !onTeamTab },
        { label: "Team work", href: "/marketing?view=team", on: onTeamTab, extra: fresh > 0 && <Pill tone="warn" small>{fresh} new</Pill> },
      ]}
    />
  );
  const flash = <FlashNote ok={sp.ok} error={sp.error} messages={{ ...OK_MESSAGES, ...TASK_FLASH }} />;

  if (!onTeamTab) {
    const names = await nameResolver(emailsIn(mine));
    const o = { names, today };
    return (
      <div className="stack">
        {head}
        <HelpBox module="marketing" />
        {flash}
        {tabs}
        <ItemList
          title="Your requests"
          sections={sectionsOf(groupedRows(groupForViewer(mine, actor), actor, o))}
          empty="You haven't asked marketing for anything yet."
          emptyAction={
            <Button href="/marketing/new" size="small">
              New marketing request
            </Button>
          }
        />
      </div>
    );
  }

  // The team's work: open requests (pieces for events among them) and the Marketing task still open on older events, newest first.
  const [events, finished, members] = await Promise.all([store.listByType("event", ["approved", "close_out"]), store.listByType("marketing", FINISHED, 100), queueTeamMembers("marketing")]);
  const eventCards = events.filter(isEventCard);
  const openTasks = queueItems(eventCards, "marketing", today);
  const doneTasks = recentlyDone(eventCards, "marketing", 10);
  // Rooms are only needed to show an older event's Marketing task.
  const rooms = openTasks.length || doneTasks.length ? (await eventContext()).rooms : [];
  // The events pieces are for: approved ones are loaded already; ones still in review are read one by one.
  const loaded = new Map<string, EventCard>(eventCards.map((c) => [c.id, c]));
  const wanted = [...new Set([...open, ...finished].flatMap((c) => (isMarketingCard(c) && c.marketing.eventCardId ? [c.marketing.eventCardId] : [])))];
  for (const c of await Promise.all(wanted.filter((id) => !loaded.has(id)).map((id) => store.get(id)))) if (isEventCard(c)) loaded.set(c.id, c);
  const feedEvents = new Map<string, FeedEvent>(wanted.flatMap((id) => {
    const c = loaded.get(id);
    return c ? [[id, { id, title: c.title, date: firstDate(c), approved: !waitsOnEvent(c) }] as const] : [];
  }));
  const feed = marketingFeed(open, openTasks, feedEvents);
  const filter = feedFilter(sp.f);
  const grouped = sp.layout === "event";
  const shown = feed.filter((x) => filter.test(x, viewer.email));
  // Recently done: finished requests and finished event tasks, newest first.
  const done = marketingFeed(finished.filter(isMarketingCard).slice(0, 10), doneTasks, feedEvents).slice(0, 10);

  const cardsShown = [...feed, ...done].map((x) => (x.kind === "request" ? x.card : x.item.card));
  const names = await nameResolver([...emailsIn(cardsShown), ...[...feed, ...done].flatMap((x) => (x.kind === "task" && x.item.task.assignee ? [x.item.task.assignee] : [])), ...members]);
  const o = { names, today };
  const people = peopleOptions(members, viewer.email, names);
  const qs = (over: Record<string, string>) => {
    const q = new URLSearchParams({ view: "team", ...(filter.id === "all" ? {} : { f: filter.id }), ...(grouped ? { layout: "event" } : {}), ...over });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    return `/marketing?${q}`;
  };
  const back = qs({});

  // On the team's lists, say who asked. A piece's title names its event; its row adds the event's date, and says so while the event isn't approved yet.
  const requestRow = (card: MarketingCard, event?: FeedEvent): RowData => {
    const r = rowsFor([card], actor, o)[0];
    const sub = event ? `Event on ${dayText(event.date)} · from ${names(card.ownerEmail)}` : `${r.sub} · from ${names(card.ownerEmail)}`;
    return { ...r, sub, ...(event && !event.approved && OPEN_STAGES.includes(card.marketing.stage) ? { flags: [EVENT_NOT_APPROVED] } : {}) };
  };
  const row = (x: FeedItem, withButtons: boolean) =>
    x.kind === "request" ? (
      <CardRow key={x.card.id} row={requestRow(x.card, x.event)} />
    ) : (
      <EventTaskRow key={`${x.item.card.id}-${x.item.task.id}`} item={x.item} withButtons={withButtons} names={names} rooms={rooms} email={viewer.email} roles={viewer.actingRoles} back={back} people={people} />
    );
  const empty = filter.id === "all" ? "Nothing open. New requests and marketing for events show up here as they come in." : "Nothing here.";
  const others = shown.filter((x) => !eventOf(x));

  return (
    <div className="stack">
      {head}
      {flash}
      {tabs}
      <div className={styles.filterBar}>
        <Chips label="Filter" chips={FEED_FILTERS.map((f) => ({ label: f.label, href: qs({ f: f.id === "all" ? "" : f.id }), on: f.id === filter.id, count: feed.filter((x) => f.test(x, viewer.email)).length }))} />
        <Chips label="Layout" chips={[{ label: "List", href: qs({ layout: "" }), on: !grouped }, { label: "By event", href: qs({ layout: "event" }), on: grouped }]} />
      </div>
      {grouped && shown.length > 0 ? (
        <>
          {/* One panel per event, soonest first, so each event's pieces read together. */}
          {byEvent(shown).map((g) => (
            <Panel key={g.event.id} title={<Link href={`/events/${g.event.id}`}>{g.event.title}</Link>} right={<span>{dayText(g.event.date)} · {g.items.length} open</span>} flush>
              <Rows>{g.items.map((x) => row(x, true))}</Rows>
            </Panel>
          ))}
          {others.length > 0 && (
            <Panel title="Not for an event" right={<span>{others.length} open</span>} flush>
              <Rows>{others.map((x) => row(x, true))}</Rows>
            </Panel>
          )}
        </>
      ) : (
        <Panel title={filter.label} right={<span>{shown.length} open</span>} flush>
          {shown.length === 0 ? <EmptyState>{empty}</EmptyState> : <Rows>{shown.map((x) => row(x, true))}</Rows>}
        </Panel>
      )}
      {actor.roles.includes("marketing") && <p className="hint">Anyone on the team can pick up a new request, except their own: someone else on the team takes those.</p>}
      {done.length > 0 && (
        <Disclosure summary={`Recently done (${done.length})`}>
          <Panel flush>
            <Rows>{done.map((x) => row(x, false))}</Rows>
          </Panel>
        </Disclosure>
      )}
    </div>
  );
}
