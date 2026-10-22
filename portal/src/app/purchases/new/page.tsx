import Link from "next/link";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { cardsHeldBy, purchaseContext } from "@/lib/purchases/settings";
import { createPurchase, fundsFor } from "../actions";
import PurchaseForm from "../PurchaseForm";

export const dynamic = "force-dynamic";

export default async function NewPurchase() {
  const viewer = await requireViewer();
  const vendors = await (await cardStore()).listVendors();
  const ctx = await purchaseContext();
  return (
    <>
      <p className="crumb">
        <Link href="/purchases">Purchase Requests</Link>
      </p>
      <h1>New purchase request</h1>
      <p className="lead">It goes to your fund&apos;s chair, then the finance office. You can follow it in My Requests.</p>
      <PurchaseForm
        action={createPurchase}
        requesterName={viewer.name}
        cards={cardsHeldBy(ctx, viewer.email).map((c) => ({ last4: c.last4, fund: c.fund }))}
        funds={await fundsFor(viewer, ctx)}
        vendors={vendors.map((v) => ({ name: v.name, w9OnFile: v.w9OnFile }))}
        submitLabel="Submit request"
      />
    </>
  );
}
