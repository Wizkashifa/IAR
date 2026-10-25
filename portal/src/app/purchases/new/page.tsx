import Link from "next/link";
import type { Metadata } from "next";
import { requireViewer } from "@/lib/viewer";
import { cardsHeldBy, purchaseContext } from "@/lib/purchases/settings";
import { createPurchase, fundsFor } from "../actions";
import PurchaseForm from "../PurchaseForm";
import { vendorFormProps } from "../formData";
import { linkableEventsFor } from "@/lib/events/context";
import { ModuleHead } from "@/components/ModuleHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New purchase request" };

export default async function NewPurchase() {
  const viewer = await requireViewer();
  const ctx = await purchaseContext();
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb">
        <Link href="/purchases">Purchase Requests</Link> / New
      </nav>
      <ModuleHead title="New purchase request" lead="It goes to your committee's chair, then the finance office. Split it across as many sub-accounts as you need, and link it to an event so its cost shows up there." />
      <PurchaseForm
        action={createPurchase}
        requesterName={viewer.name}
        cards={cardsHeldBy(ctx, viewer.email).map((c) => ({ last4: c.last4, fund: c.fund }))}
        funds={await fundsFor(viewer, ctx)}
        {...await vendorFormProps(viewer)}
        events={await linkableEventsFor(viewer)}
        submitLabel="Send request"
        cancelHref="/purchases"
      />
    </>
  );
}
