import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { cardsHeldBy, purchaseContext } from "@/lib/purchases/settings";
import { isPurchaseCard, permission } from "@/lib/purchases/workflow";
import { fundsFor, resubmitPurchase } from "../../actions";
import PurchaseForm from "../../PurchaseForm";
import { vendorFormProps } from "../../formData";
import { linkableEventsFor } from "@/lib/events/context";
import type { Metadata } from "next";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import styles from "../../purchases.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Make changes · Purchase request" };

export default async function EditPurchase({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();
  const store = await cardStore();
  const card = await store.get(id);
  if (!isPurchaseCard(card) || card.ownerEmail.toLowerCase() !== viewer.email.toLowerCase()) notFound();
  if (!permission(card, { email: viewer.email, name: viewer.name, roles: viewer.actingRoles }, "resubmit").ok) redirect(`/purchases/${id}`);
  const p = card.purchase;
  const ctx = await purchaseContext();
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb">
        <Link href="/purchases">Purchase Requests</Link> / <Link href={`/purchases/${id}`}>{id}</Link> / Make changes
      </nav>
      <ModuleHead title="Make the changes and send it again" lead={card.title} />
      {p.returnNote && (
        <div className={styles.body}>
          <Note tone="warn">
            <strong>What was asked:</strong> {p.returnNote}
          </Note>
        </div>
      )}
      <PurchaseForm
        action={resubmitPurchase.bind(null, id)}
        requesterName={viewer.name}
        cards={cardsHeldBy(ctx, viewer.email).map((c) => ({ last4: c.last4, fund: c.fund }))}
        funds={await fundsFor(viewer, ctx)}
        {...await vendorFormProps(viewer)}
        events={await linkableEventsFor(viewer)}
        existingFiles={p.attachments.map((a) => a.name)}
        existingW9={p.w9Uploaded?.name}
        submitLabel="Send it again"
        cancelHref={`/purchases/${id}`}
        initial={{
          kind: p.kind,
          fund: p.fund,
          description: p.description,
          payee: p.payee,
          invoiceNumber: p.invoiceNumber,
          delivery: p.delivery,
          mailingAddress: p.mailingAddress,
          isLabor: p.isLabor,
          relatedParty: p.relatedParty,
          cardLast4: p.card?.last4,
          statementMonth: p.card?.statementMonth,
          lines: p.lines.map((l) => ({
            accountId: l.accountId,
            amount: l.amount.toFixed(2),
            note: l.note ?? "",
            date: l.date ?? "",
            merchant: l.merchant ?? "",
            hasReceipt: l.hasReceipt,
            flag: l.flag ?? "",
            repayBy: l.repayBy ?? "",
          })),
          attestationName: p.attestation.name,
          eventCardId: p.eventCardId,
        }}
      />
    </>
  );
}
