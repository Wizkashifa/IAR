import "server-only";
import { cardStore } from "../cards";
import { deliver, sendAlerts } from "../notifications";
import { followUps, morningDigest } from "./reminders";
import { purchaseContext } from "./settings";
import { isPurchaseCard } from "./workflow";

/**
 * Purchase Requests' part of the daily job: reminders after 3 days,
 * escalation to the director after 5, and the weekday morning digest.
 */
export async function daily(now: Date): Promise<string> {
  const iso = now.toISOString();
  const store = await cardStore();
  const ctx = await purchaseContext();
  const open = (await store.listOpenPurchases()).filter(isPurchaseCard);
  let reminded = 0;
  let escalated = 0;
  for (const f of followUps(open, iso, (fund) => ctx.routing.approversFor(fund).directors ?? [])) {
    const before = open.find((c) => c.id === f.card.id)!;
    try {
      // Keep updatedAt: a reminder isn't a change anyone needs to reload for.
      await store.save(f.card, before.updatedAt);
    } catch {
      continue;
    }
    await deliver(f.notices, "portal");
    if (f.kind === "remind") reminded++;
    else escalated++;
  }
  // The digest is a Chat message only: the bell already lists each request.
  const digest = morningDigest(open, iso);
  await sendAlerts(digest.map((n) => ({ to: "email" in n.to ? n.to.email : `role:${n.to.role}`, text: n.text, href: n.href })));
  return `${reminded} reminder${reminded === 1 ? "" : "s"}, ${escalated} escalation${escalated === 1 ? "" : "s"}, ${digest.length} morning digest${digest.length === 1 ? "" : "s"}.`;
}
