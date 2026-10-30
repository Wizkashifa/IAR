import type { Metadata } from "next";
import { cardStore, type CardStatus } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { actorFor } from "@/lib/people";
import { todayLocal } from "@/lib/dates";
import { nameResolver } from "@/lib/names";
import { emailsIn, type RowData } from "@/lib/card-row";
import { groupForViewer } from "@/lib/needs-you";
import { isMarketingCard, type MarketingCard } from "@/lib/marketing/workflow";
import { FEED_FILTERS, feedFilter, marketingFeed, type FeedItem } from "@/lib/marketing/feed";
import { eventContext } from "@/lib/events/context";
import { queueItems, recentlyDone } from "@/lib/events/queues";
import { isEventCard } from "@/lib/events/workflow";
import { queueTeamMembers } from "@/lib/groups";
import { Button } from "@/components/Button";
import { Chips } from "@/components/Chips";
import { Disclosure } from "@/components/Disclosure";
import { EmptyState } from "@/components/EmptyState";
import { ItemList, groupedRows, rowsFor, sectionsOf } from "@/components/ItemList";
import { CardRow, Rows } from "@/components/ItemRow";
import { HelpBox } from "@/components/HelpBox";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { Tabs } from "@/components/Tabs";
import { ToastOnLoad } from "@/components/toast";
import Link from "next/link";
import { EventTaskRow } from "../events/ops-ui";
import { OK_MESSAGES } from "./ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing Requests" };

const OPEN: CardStatus[] = ["submitted", "changes_requested", "approved"];
const FINISHED: CardStatus[] = ["closed", "denied"];

type Search = { view?: string; f?: string; ok?: string; error?: string };

export default async function MarketingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const store = await cardStore();
  // The team's work: the marketing team, and the office, executives and admins who can open every request.
  const team = viewer.roles.some((r) => r === "marketing" || r === "office" || r === "executive");
  const onTeamTab = team && sp.view === "team";
  const today = todayLocal();

  const mine = (await store.listByOwner(viewer.email)).filter(isMarketingCard);
  const open = team ? (await store.listByType("marketing", OPEN)).filter(isMarketingCard) : [];
  const fresh = open.filter((c) => c.marketing.stage === "review").length;

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
      label="Show"
      tabs={[
        { label: "Your requests", href: "/marketing", on: !onTeamTab },
        { label: "Team work", href: "/marketing?view=team", on: onTeamTab, extra: fresh > 0 && <Pill tone="warn" small>{fresh} new</Pill> },
      ]}
    />
  );
  const flash = (
    <>
      <ToastOnLoad message={sp.ok ? OK_MESSAGES[sp.ok] : undefined} />
      {sp.error && <Note tone="bad">{sp.error}</Note>}
    </>
  );

  if (!onTeamTab) {
    const names = await nameResolver(emailsIn(mine));
    const o = { names, today };
    return (
      <div className="stack loose">
        {head}
        <HelpBox module="marketing" />
        {flash}
        {tabs}
        <Note>
          Marketing an event? Ask for it on the <Link href="/events/new">event request</Link>: marketing and A/V are part of the same form.
        </Note>
        {team && (
          <p className="hint">
            {fresh > 0 ? `${fresh} new request${fresh === 1 ? "" : "s"} waiting. ` : ""}The team&apos;s requests and event marketing are under <Link href="/marketing?view=team">Team work</Link>.
          </p>
        )}
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

  // The team's work: open requests and the Marketing task on each approved event, newest first.
  const [ctx, events, finished, members] = await Promise.all([
    eventContext(),
    store.listByType("event", ["approved", "close_out"]),
    store.listByType("marketing", FINISHED, 100),
    queueTeamMembers("marketing"),
  ]);
  const eventCards = events.filter(isEventCard);
  const feed = marketingFeed(open, queueItems(eventCards, "marketing", today));
  const filter = feedFilter(sp.f);
  const shown = feed.filter((x) => filter.test(x, viewer.email));
  // Recently done: finished requests and finished event tasks, newest first.
  const doneRequests = finished.filter(isMarketingCard).slice(0, 10);
  const done: FeedItem[] = [
    ...doneRequests.map((card) => ({ kind: "request" as const, card, at: card.updatedAt })),
    ...recentlyDone(eventCards, "marketing", 10).map((item) => ({ kind: "task" as const, item, at: item.task.history.at(-1)?.at ?? item.card.updatedAt })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);

  const cardsShown = [...feed, ...done].map((x) => (x.kind === "request" ? x.card : x.item.card));
  const names = await nameResolver([...emailsIn(cardsShown), ...[...feed, ...done].flatMap((x) => (x.kind === "task" && x.item.task.assignee ? [x.item.task.assignee] : [])), ...members]);
  const o = { names, today };
  const people = members.map((m) => ({ email: m, name: m === viewer.email.toLowerCase() ? `Me (${names(m)})` : names(m) }));
  const back = `/marketing?view=team${filter.id === "all" ? "" : `&f=${filter.id}`}`;

  // On the team's lists, say who asked.
  const requestRow = (card: MarketingCard): RowData => {
    const r = rowsFor([card], actor, o)[0];
    return { ...r, sub: `${r.sub} · from ${names(card.ownerEmail)}` };
  };
  const row = (x: FeedItem, withButtons: boolean) =>
    x.kind === "request" ? (
      <CardRow key={x.card.id} row={requestRow(x.card)} />
    ) : (
      <EventTaskRow key={`${x.item.card.id}-${x.item.task.id}`} item={x.item} withButtons={withButtons} names={names} rooms={ctx.rooms} email={viewer.email} roles={viewer.actingRoles} back={back} people={people} />
    );

  return (
    <div className="stack">
      {head}
      <HelpBox module="marketing" />
      {flash}
      {tabs}
      <Chips label="Filter" chips={FEED_FILTERS.map((f) => ({ label: f.label, href: f.id === "all" ? "/marketing?view=team" : `/marketing?view=team&f=${f.id}`, on: f.id === filter.id, count: feed.filter((x) => f.test(x, viewer.email)).length }))} />
      <Panel title={filter.label} right={<span>{shown.length}</span>} flush>
        {shown.length === 0 ? (
          <EmptyState>{filter.id === "all" ? "Nothing open. New requests and approved events' marketing show up here as they come in." : "Nothing here."}</EmptyState>
        ) : (
          <Rows>{shown.map((x) => row(x, true))}</Rows>
        )}
      </Panel>
      <p className="hint">Anyone on the team can pick up a new request, except their own: someone else on the team takes those.</p>
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
