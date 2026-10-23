import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { todayLocal } from "@/lib/away";
import { isMarketingCard, permission } from "@/lib/marketing/workflow";
import { committeesFor, editMarketing } from "../../actions";
import MarketingForm from "../../MarketingForm";

export const dynamic = "force-dynamic";

/** The requester changes their request before it's scheduled, or answers marketing's question. */
export default async function EditMarketing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();
  const card = await (await cardStore()).get(id);
  if (!isMarketingCard(card) || card.ownerEmail.toLowerCase() !== viewer.email.toLowerCase()) notFound();
  const m = card.marketing;
  const answering = m.stage === "question";
  const actor = { email: viewer.email, name: viewer.name, roles: viewer.actingRoles };
  if (!permission(card, actor, answering ? "answer" : "edit").ok) redirect(`/marketing/${id}`);
  return (
    <>
      <p className="crumb">
        <Link href={`/marketing/${id}`}>{id}</Link>
      </p>
      <h1>{answering ? "Answer marketing's question" : "Edit your request"}</h1>
      <p className="lead">{card.title}</p>
      <MarketingForm
        action={editMarketing.bind(null, id, card.updatedAt)}
        kind={m.kind}
        committees={await committeesFor(viewer)}
        question={answering ? m.question ?? "" : undefined}
        initial={{ kind: m.kind, answers: m.answers, committee: card.committee, driveLink: m.driveLink, notes: m.notes }}
        today={todayLocal()}
        cancelHref={`/marketing/${id}`}
        submitLabel={answering ? "Send answer" : "Save changes"}
      />
    </>
  );
}
