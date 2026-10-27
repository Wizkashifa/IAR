import type { Metadata } from "next";
import { requireViewer } from "@/lib/viewer";
import { cardsHeldBy, purchaseContext } from "@/lib/purchases/settings";
import { createPurchase, fundsFor } from "../actions";
import PurchaseForm from "../PurchaseForm";
import { vendorFormProps } from "../formData";
import { linkableEventsFor } from "@/lib/events/context";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { todayLocal } from "@/lib/dates";
import { canRequestAgain, copiedNote, purchaseAgain } from "@/lib/again";
import { cardStore } from "@/lib/cards";
import { isPurchaseCard } from "@/lib/purchases/workflow";
import { Crumb } from "@/components/Crumb";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New payment request" };

export default async function NewPurchase({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const viewer = await requireViewer();
  const ctx = await purchaseContext();
  const funds = await fundsFor(viewer, ctx);
  // "Request this again": start from a finished request this person made or chairs.
  const source = from ? await (await cardStore()).get(from) : null;
  const copy = isPurchaseCard(source) && canRequestAgain(source, viewer, todayLocal()) ? purchaseAgain(source.purchase) : undefined;
  const held = cardsHeldBy(ctx, viewer.email).map((c) => ({ last4: c.last4, fund: c.fund }));
  if (copy && !funds.includes(copy.fund)) copy.fund = "";
  if (copy?.cardLast4 && !held.some((c) => c.last4 === copy.cardLast4)) copy.cardLast4 = undefined;
  return (
    <>
      <Crumb trail={[{ href: "/purchases", label: "Payments" }]} here="New" />
      <ModuleHead title="New payment request" lead="It goes to your committee's chair, then the finance office. Split it across as many sub-accounts as you need, and link it to an event so its cost shows up there." />
      {copy && source && <Note tone="info">{copiedNote(source.id)} Add this time&apos;s receipts.</Note>}
      <PurchaseForm
        initial={copy}
        action={createPurchase}
        requesterName={viewer.name}
        cards={held}
        funds={funds}
        {...await vendorFormProps(viewer)}
        events={await linkableEventsFor(viewer)}
        submitLabel="Send request"
        cancelHref="/purchases"
      />
    </>
  );
}
