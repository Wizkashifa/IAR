import Link from "next/link";
import { MARKETING_TYPES, neededBy } from "@/lib/marketing/forms";
import { STAGE_LABEL, type MarketingCard } from "@/lib/marketing/workflow";
import { StatusPill, fmtDate, fmtDay } from "../ui";

/** The stage, on the shared status colors ("In progress" rather than "Approved"). */
export function StagePill({ card }: { card: MarketingCard }) {
  const s = card.marketing.stage;
  return <StatusPill status={card.status} label={s === "question" ? "Question for requester" : STAGE_LABEL[s]} />;
}

/** Done-by for scheduled work; otherwise when the requester needs it. */
function DateCell({ card }: { card: MarketingCard }) {
  const m = card.marketing;
  if (m.doneBy && (m.stage === "scheduled" || m.stage === "doing")) return <>Done by {fmtDay(m.doneBy)}</>;
  if (m.stage === "done") return <>Done {fmtDate(m.stageSince)}</>;
  const due = neededBy(m.answers);
  return due ? <>Needed by {fmtDay(due)}</> : <span className="sub">No date</span>;
}

export function MarketingTable({ cards, showOwner, empty }: { cards: MarketingCard[]; showOwner?: boolean; empty: string }) {
  if (cards.length === 0) return <div className="panel empty">{empty}</div>;
  return (
    <div className="tablewrap">
      <table className="table">
        <thead>
          <tr>
            <th>Request</th>
            <th>Committee</th>
            <th>When</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`/marketing/${c.id}`}>
                  <strong>{c.title}</strong>
                </Link>
                <div className="sub">
                  {c.id} · {MARKETING_TYPES[c.marketing.kind].label}
                  {showOwner ? ` · ${c.marketing.requesterName}` : ""}
                </div>
              </td>
              <td>{c.committee}</td>
              <td className="nowrap">
                <DateCell card={c} />
              </td>
              <td>
                <StagePill card={c} />
                {c.waitingOn && <div className="sub">{c.waitingOn}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const OK_MESSAGES: Record<string, string> = {
  submitted: "Request submitted. Marketing reviews new requests each week. You can follow it here and in My Requests.",
  edit: "Changes saved.",
  answer: "Answer sent. The request is back in marketing's weekly review.",
  schedule: "Scheduled. The requester is told the done-by date.",
  ask: "Question sent to the requester.",
  decline: "Declined. The requester is told why.",
  start: "Started. It shows as in progress.",
  reschedule: "Done-by date changed. The requester is told.",
  finish: "Marked done. The requester is told.",
  cancel: "Request cancelled.",
  commented: "Comment added. The people on this request can see it.",
};
