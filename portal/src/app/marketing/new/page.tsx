import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { todayLocal } from "@/lib/dates";
import { canRequestAgain, copiedNote, marketingAgain } from "@/lib/again";
import { cardStore } from "@/lib/cards";
import { isMarketingCard } from "@/lib/marketing/workflow";
import { MARKETING_TYPES, isMarketingKind } from "@/lib/marketing/forms";
import { MARKETING_KINDS } from "@/lib/marketing/types";
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

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ type?: string }> }): Promise<Metadata> {
  const { type } = await searchParams;
  return { title: isMarketingKind(type) ? `${MARKETING_TYPES[type].label} · Marketing` : "New marketing request" };
}

/** Pick a type from the cards, then answer that type's questions. */
export default async function NewMarketing({ searchParams }: { searchParams: Promise<{ type?: string; from?: string }> }) {
  const { type, from } = await searchParams;
  const viewer = await requireViewer();
  const crumb = (
    <Crumb trail={[{ href: "/marketing", label: "Marketing Requests" }]} here="New request" />
  );

  if (!isMarketingKind(type)) {
    return (
      <div className="stack loose">
        <div className="stack tight">
          {crumb}
          <ModuleHead title="What do you need from marketing?" lead="Requests are reviewed and prioritized each week by the team that oversees IAR Marketing." />
        </div>
        <Note>
          Marketing a program or event? Put it on the <Link href="/events/new">event request</Link>. It asks marketing&apos;s questions and unlocks marketing once the event is approved.
        </Note>
        <LinkCards label="Kinds of marketing request">
          {MARKETING_KINDS.map((k) => (
            <LinkCard key={k} href={`/marketing/new?type=${k}`} icon={TYPE_ICON[k]} title={MARKETING_TYPES[k].label}>
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
        {crumb}
        <ModuleHead
          title={t.label}
          lead={t.blurb}
          actions={
            <Button href="/marketing/new" icon="chevL">
              Change type
            </Button>
          }
        />
      </div>
      {t.note && <Note>{t.note}</Note>}
      {committees.length === 0 && (
        <Note tone="warn">You&apos;re not on a committee or team in the portal yet, so there&apos;s nothing to request for. Ask your committee chair to add you to its Google Group.</Note>
      )}
      {copy && source && <Note>{copiedNote(source.id)}</Note>}
      <MarketingForm action={createMarketing} kind={type} committees={committees} initial={copy} today={today} cancelHref="/marketing" submitLabel="Send request" uploads={Boolean(await marketingFolder())} />
    </div>
  );
}
