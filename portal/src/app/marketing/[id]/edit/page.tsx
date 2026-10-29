import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { todayLocal } from "@/lib/dates";
import { isMarketingCard, permission } from "@/lib/marketing/workflow";
import { ModuleHead } from "@/components/ModuleHead";
import { committeesFor, editMarketing } from "../../actions";
import MarketingForm from "../../MarketingForm";
import { Crumb } from "@/components/Crumb";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edit ${id} · Marketing` };
}

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
    <div className="stack loose">
      <div className="stack tight">
        <Crumb trail={[{ href: "/marketing", label: "Marketing Requests" }, { href: `/marketing/${id}`, label: id }]} here={answering ? "Answer" : "Edit"} />
        <ModuleHead accent="mkt" title={answering ? "Answer marketing's question" : "Edit your request"} lead={card.title} />
      </div>
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
    </div>
  );
}
