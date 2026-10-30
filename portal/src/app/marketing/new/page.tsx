import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { todayLocal } from "@/lib/dates";
import { canRequestAgain, copiedNote, marketingAgain } from "@/lib/again";
import { cardStore } from "@/lib/cards";
import { isMarketingCard } from "@/lib/marketing/workflow";
import { MARKETING_TYPES, PICKER_KINDS, isMarketingKind } from "@/lib/marketing/forms";
import { isEventCard, whenText } from "@/lib/events/workflow";
import { EVENT_NOT_APPROVED, mayAddPiece, suggestedDue, waitsOnEvent } from "@/lib/marketing/linked";
import { actorFor } from "@/lib/people";
import { notFound } from "next/navigation";
import { canOpenCard } from "@/lib/access";
import { marketingFolder } from "@/lib/marketing/drive";
import { Button } from "@/components/Button";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { committeesFor, createMarketing } from "../actions";
import MarketingForm from "../MarketingForm";
import { TYPE_ICON } from "../ui";
import { LinkCard, LinkCards } from "@/components/LinkCard";
import { Crumb } from "@/components/Crumb";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ type?: string; event?: string }> }): Promise<Metadata> {
  const { type, event } = await searchParams;
  if (event) return { title: "Add a marketing piece" };
  return { title: isMarketingKind(type) && type !== "event" ? `${MARKETING_TYPES[type].label} · Marketing` : "New marketing request" };
}

/**
 * Pick a type from the cards, then answer that type's questions. With
 * `?event=`: a piece of marketing for that event, added from its page.
 */
export default async function NewMarketing({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; event?: string }> }) {
  const { type, from, event } = await searchParams;
  const viewer = await requireViewer();
  const crumb = (
    <Crumb trail={[{ href: "/marketing", label: "Marketing Requests" }]} here="New request" />
  );

  if (event) return <NewPiece eventId={event} />;

  // A piece for an event is added from the event's page, so the picker doesn't offer it.
  if (!isMarketingKind(type) || type === "event") {
    return (
      <div className="stack loose">
        <div className="stack tight">
          {crumb}
          <ModuleHead accent="mkt" title="What do you need from marketing?" lead="Someone on the marketing team picks up new requests as they come in." />
        </div>
        <Note>
          Marketing an event? Open it from <Link href="/events">Events &amp; Rooms</Link> and use <strong>Add a marketing piece</strong> in its Marketing section. Each piece (a flyer, posts, a video, a banner) stays linked to the event.
        </Note>
        <LinkCards label="Kinds of marketing request">
          {PICKER_KINDS.map((k) => (
            <LinkCard key={k} href={`/marketing/new?type=${k}`} icon={TYPE_ICON[k]} accent="mkt" title={MARKETING_TYPES[k].label}>
              {MARKETING_TYPES[k].blurb}
            </LinkCard>
          ))}
        </LinkCards>
      </div>
    );
  }

  const t = MARKETING_TYPES[type];
  const committees = await committeesFor(viewer);
  const today = todayLocal();
  // "Request this again": start from a finished request of the same type this person made or chairs.
  const source = from ? await (await cardStore()).get(from) : null;
  const copy = isMarketingCard(source) && source.marketing.kind === type && canRequestAgain(source, viewer, today) ? marketingAgain(source.marketing, source.committee, today) : undefined;
  if (copy && !committees.includes(copy.committee)) copy.committee = "";
  return (
    <div className="stack loose">
      <div className="stack tight">
        {/* The middle step goes back to the list of types. */}
        <Crumb trail={[{ href: "/marketing", label: "Marketing Requests" }, { href: "/marketing/new", label: "New request" }]} here={t.label} />
        <ModuleHead accent="mkt" title={t.label} lead={t.blurb} />
      </div>
      {t.note && <Note>{t.note}</Note>}
      {committees.length === 0 && (
        <Note tone="warn">You&apos;re not on a committee or team in the portal yet, so there&apos;s nothing to request for. Ask your committee's chair to add you.</Note>
      )}
      {copy && source && <Note>{copiedNote(source.id)}</Note>}
      <MarketingForm action={createMarketing} kind={type} committees={committees} initial={copy} today={today} cancelHref="/marketing" submitLabel="Send request" uploads={Boolean(await marketingFolder())} />
    </div>
  );
}

/** A piece of marketing for one event: the event at the top, then the piece's questions. */
async function NewPiece({ eventId }: { eventId: string }) {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const card = await (await cardStore()).get(eventId);
  if (!isEventCard(card) || !canOpenCard(card, { ...actor, seeAll: viewer.roles.includes("admins") })) notFound();
  const e = card.event;
  const may = mayAddPiece(card, actor);
  const today = todayLocal();
  const crumb = <Crumb trail={[{ href: "/events", label: "Events & Rooms" }, { href: `/events/${card.id}`, label: card.id }]} here="Add a marketing piece" />;
  const head = <ModuleHead accent="mkt" title="Add a marketing piece" lead="One piece per request: a flyer, posts, a video, a banner. Marketing sees the event's details, brief and images." />;
  if (!may.ok) {
    return (
      <div className="stack loose">
        <div className="stack tight">
          {crumb}
          {head}
        </div>
        <Note tone="warn">{may.reason}</Note>
        <div>
          <Button href={`/events/${card.id}`} icon="chevL">
            Back to the event
          </Button>
        </div>
      </div>
    );
  }
  const when = whenText(card);
  return (
    <div className="stack loose">
      <div className="stack tight">
        {crumb}
        {head}
      </div>
      {waitsOnEvent(card) && <Note>The event isn&apos;t approved yet. Marketing can start on this piece now, and it says “{EVENT_NOT_APPROVED}” until it is.</Note>}
      <MarketingForm
        action={createMarketing}
        kind="event"
        committees={[e.committeeName]}
        initial={{ kind: "event", committee: e.committeeName, answers: { due: suggestedDue(card, today) } }}
        today={today}
        cancelHref={`/events/${card.id}`}
        submitLabel="Send to marketing"
        uploads={Boolean(await marketingFolder())}
        event={{ id: card.id, title: card.title, when, committee: e.committeeName }}
      />
    </div>
  );
}
