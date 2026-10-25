import type { Metadata } from "next";
import { cardStore, type CardStatus } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { actorFor } from "@/lib/people";
import { todayLocal } from "@/lib/dates";
import { nameResolver } from "@/lib/names";
import { emailsIn, type RowData } from "@/lib/card-row";
import { groupForViewer } from "@/lib/needs-you";
import { isMarketingCard, reviewableBy, type MarketingCard } from "@/lib/marketing/workflow";
import { Button } from "@/components/Button";
import { ItemList, groupedRows, rowsFor, sectionsOf } from "@/components/ItemList";
import { HelpBox } from "@/components/HelpBox";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { ToastOnLoad } from "@/components/toast";
import Link from "next/link";
import { OK_MESSAGES } from "./ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing Requests" };

const OPEN: CardStatus[] = ["submitted", "changes_requested", "approved"];
const FINISHED: CardStatus[] = ["closed", "denied"];

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const store = await cardStore();
  // The team's lists: the marketing team, and the office, executives and admins who can open every request.
  const team = viewer.roles.some((r) => r === "marketing" || r === "office" || r === "executive");
  const [mine, open, finished] = await Promise.all([
    store.listByOwner(viewer.email),
    team ? store.listByType("marketing", OPEN) : Promise.resolve([]),
    team ? store.listByType("marketing", FINISHED, 100) : Promise.resolve([]),
  ]);
  const own = mine.filter(isMarketingCard);
  const all = open.filter(isMarketingCard);
  const oldestFirst = (a: MarketingCard, b: MarketingCard) => a.marketing.stageSince.localeCompare(b.marketing.stageSince);
  const review = all.filter((c) => c.marketing.stage === "review").sort(oldestFirst);
  const reviewable = reviewableBy(review, actor).length;
  const asked = all.filter((c) => c.marketing.stage === "question").sort(oldestFirst);
  const byDoneBy = (a: MarketingCard, b: MarketingCard) => (a.marketing.doneBy ?? "9").localeCompare(b.marketing.doneBy ?? "9");
  const working = all.filter((c) => c.marketing.stage === "scheduled" || c.marketing.stage === "doing").sort(byDoneBy);
  const done = finished.filter(isMarketingCard).slice(0, 10);
  const onTeam = actor.roles.includes("marketing");

  const names = await nameResolver(emailsIn([...own, ...all, ...done]));
  const o = { names, today: todayLocal() };
  // On the team's lists, say who asked.
  const withRequester = (cards: MarketingCard[]): RowData[] =>
    rowsFor(cards, actor, o).map((r, i) => ({ ...r, sub: `${r.sub} · from ${names(cards[i].ownerEmail)}` }));

  return (
    <div className="stack loose">
      <ModuleHead
        title="Marketing Requests"
        lead="Graphics, signs, announcements, highlights, webpages, short links and staff badges."
        actions={
          <Button href="/marketing/new" variant="primary" icon="plus">
            New marketing request
          </Button>
        }
      />
      <HelpBox module="marketing" />
      <ToastOnLoad message={ok ? OK_MESSAGES[ok] : undefined} />
      {error && <Note tone="bad">{error}</Note>}
      <Note>
        Marketing an event? Ask for it on the <Link href="/events/new">event request</Link>: marketing and A/V are part of the same form.
      </Note>

      {team && (
        <ItemList
          title="Weekly review"
          right={`${review.length} new`}
          rows={withRequester(review)}
          empty={
            onTeam
              ? "No new requests to review this week."
              : "No new requests. The marketing team reviews new ones each week."
          }
        />
      )}
      {team && onTeam && review.length > reviewable && (
        <p className="sub">Your own requests are reviewed by someone else on the team.</p>
      )}
      {team && <ItemList title="Scheduled and in progress" right={`${working.length}`} rows={withRequester(working)} empty="Nothing scheduled." />}
      {team && asked.length > 0 && (
        <ItemList title="Waiting on the requester" right={`${asked.length}`} rows={withRequester(asked)} empty="" />
      )}

      <ItemList
        title="Your requests"
        sections={sectionsOf(groupedRows(groupForViewer(own, actor), actor, o))}
        empty="You haven't asked marketing for anything yet."
        emptyAction={
          <Button href="/marketing/new" size="small">
            New marketing request
          </Button>
        }
      />

      {team && <ItemList title="Recently done" right={done.length ? `Last ${done.length}` : ""} rows={withRequester(done)} empty="Nothing finished yet." />}
    </div>
  );
}
