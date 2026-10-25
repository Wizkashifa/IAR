import "server-only";
import { cardStore } from "../cards";
import { saveThenTell } from "../daily-save";
import { sendAlerts } from "../notifications";
import { plural } from "../text";
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
    // Keep updatedAt: a reminder isn't a change anyone needs to reload for.
    if (!(await saveThenTell(store, before.updatedAt, f.card, f.notices))) continue;
    if (f.kind === "remind") reminded++;
    else escalated++;
  }
  // The digest is a Chat message only: the bell already lists each request.
  const digest = morningDigest(open, iso);
  await sendAlerts(digest.map((n) => ({ to: "email" in n.to ? n.to.email : `role:${n.to.role}`, text: n.text, href: n.href })));
  return `${plural(reminded, "reminder")}, ${plural(escalated, "escalation")}, ${plural(digest.length, "morning digest")}.`;
}
