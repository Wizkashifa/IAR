import Link from "next/link";
import { cardStore, type CardStatus } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { actorFor } from "@/lib/people";
import { isMarketingCard, reviewableBy, type MarketingCard } from "@/lib/marketing/workflow";
import { Flash } from "../ui";
import { MarketingTable, OK_MESSAGES } from "./ui";

export const dynamic = "force-dynamic";

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
  const canReview = new Set(reviewableBy(review, actor).map((c) => c.id));
  const asked = all.filter((c) => c.marketing.stage === "question").sort(oldestFirst);
  const byDoneBy = (a: MarketingCard, b: MarketingCard) => (a.marketing.doneBy ?? "9").localeCompare(b.marketing.doneBy ?? "9");
  const working = all.filter((c) => c.marketing.stage === "scheduled" || c.marketing.stage === "doing").sort(byDoneBy);
  const done = finished.filter(isMarketingCard).slice(0, 10);
  const onTeam = actor.roles.includes("marketing");

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Marketing Requests</h1>
          <p className="lead">Graphics, signs, announcements, highlights, webpages, short links and staff badges.</p>
        </div>
        <div className="row">
          <Link href="/marketing/new" className="button">
            New marketing request
          </Link>
        </div>
      </div>
      <Flash ok={ok} error={error} messages={OK_MESSAGES} />
      <div className="callout info">Marketing an event? Ask for it on the event request: marketing and A/V are part of the same form.</div>

      {team && (
        <>
          <h2>Weekly review ({review.length})</h2>
          <p className="note">
            New requests, oldest first. {onTeam ? "Schedule each one with a done-by date, ask the requester a question, or decline it." : "The marketing team reviews these each week."}
            {onTeam && review.length > canReview.size ? " Your own requests are reviewed by someone else on the team." : ""}
          </p>
          <MarketingTable cards={review} showOwner empty="No new requests to review this week." />

          <h2>Scheduled and in progress ({working.length})</h2>
          <MarketingTable cards={working} showOwner empty="Nothing scheduled." />

          {asked.length > 0 && (
            <>
              <h2>Waiting on the requester ({asked.length})</h2>
              <p className="note">Marketing asked a question. These come back to the weekly review when the requester answers.</p>
              <MarketingTable cards={asked} showOwner empty="" />
            </>
          )}
        </>
      )}

      <h2>Your requests</h2>
      <MarketingTable cards={own} empty="You haven't asked marketing for anything yet." />

      {team && (
        <>
          <h2>Recently done</h2>
          <MarketingTable cards={done} showOwner empty="Nothing finished yet." />
        </>
      )}
    </>
  );
}
