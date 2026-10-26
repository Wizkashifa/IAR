import "server-only";
import { cardStore } from "../cards";
import { DEV_PERSONAS, isDevAuth } from "../dev";
import { lookupGroups } from "../groups";
import { ORG } from "../org";
import { portalSettings } from "../portal-settings";
import { purchaseAlertsSend, purchasesDemoOn } from "../settings-rules";

/**
 * Purchase requests in demo mode (Portal Settings): whether a request's
 * alerts go out by Google Chat or email. Only beta testers' requests do; the
 * rest stay on the bell. The rule is settings-rules.ts `purchaseAlertsSend`.
 */

const TESTER_REFRESH_MS = 15 * 60 * 1000;
const testers = new Map<string, { at: number; yes: boolean }>();

async function isTester(email: string): Promise<boolean> {
  const e = email.toLowerCase();
  if (isDevAuth()) return Boolean(DEV_PERSONAS.find((p) => p.email === e)?.groups.includes(ORG.betaGroup));
  const hit = testers.get(e);
  if (hit && Date.now() - hit.at < TESTER_REFRESH_MS) return hit.yes;
  const yes = (await lookupGroups(e)).includes(ORG.betaGroup);
  testers.set(e, { at: Date.now(), yes });
  return yes;
}

/** Card ID → whether its alerts may be sent. A lookup failure keeps them in the portal: a demo must never page finance. */
export async function purchaseAlertsFor(cardIds: string[]): Promise<(cardId: string) => boolean> {
  const ids = [...new Set(cardIds.filter((id) => id.startsWith("PO-")))];
  if (ids.length === 0 || !purchasesDemoOn(await portalSettings())) return () => true;
  const store = await cardStore();
  const allowed = new Map<string, boolean>();
  for (const id of ids) {
    try {
      const card = await store.get(id);
      allowed.set(id, purchaseAlertsSend({ demo: true, ownerIsTester: card ? await isTester(card.ownerEmail) : false }));
    } catch (err) {
      console.error("demo tester lookup failed", err);
      allowed.set(id, false);
    }
  }
  return (cardId) => (cardId.startsWith("PO-") ? (allowed.get(cardId) ?? false) : true);
}
