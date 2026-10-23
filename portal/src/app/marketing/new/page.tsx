import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { todayLocal } from "@/lib/away";
import { MARKETING_TYPES, isMarketingKind } from "@/lib/marketing/forms";
import { MARKETING_KINDS } from "@/lib/marketing/types";
import { committeesFor, createMarketing } from "../actions";
import MarketingForm from "../MarketingForm";

export const dynamic = "force-dynamic";

/** Pick a type from the tiles, then answer that type's questions. */
export default async function NewMarketing({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const viewer = await requireViewer();
  const crumb = (
    <p className="crumb">
      <Link href="/marketing">Marketing Requests</Link>
    </p>
  );

  if (!isMarketingKind(type)) {
    return (
      <>
        {crumb}
        <h1>What do you need from marketing?</h1>
        <p className="lead">Requests are reviewed and prioritized each week by the team that oversees IAR Marketing.</p>
        <div className="callout info">
          Marketing a program or event? Put it on the event request. It asks marketing&apos;s questions and unlocks marketing once the event is approved.
        </div>
        <div className="tiles">
          {MARKETING_KINDS.map((k) => (
            <Link key={k} href={`/marketing/new?type=${k}`} className="tile">
              <h3>{MARKETING_TYPES[k].label}</h3>
              <p>{MARKETING_TYPES[k].blurb}</p>
            </Link>
          ))}
        </div>
      </>
    );
  }

  const t = MARKETING_TYPES[type];
  const committees = await committeesFor(viewer);
  return (
    <>
      {crumb}
      <div className="pagehead">
        <div>
          <h1>{t.label}</h1>
          <p className="lead">{t.blurb}</p>
        </div>
        <div className="row">
          <Link href="/marketing/new" className="button secondary">
            Change type
          </Link>
        </div>
      </div>
      {t.note && <div className="callout info">{t.note}</div>}
      {committees.length === 0 && (
        <div className="callout warn">You&apos;re not on a committee or team in the portal yet, so there&apos;s nothing to request for. Ask your committee chair to add you to its Google Group.</div>
      )}
      <MarketingForm action={createMarketing} kind={type} committees={committees} today={todayLocal()} cancelHref="/marketing" submitLabel="Submit request" />
    </>
  );
}
