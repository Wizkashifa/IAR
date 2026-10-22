import "server-only";
import { isDevAuth } from "../dev";
import { directory } from "../groups";
import { portalSettings, type CreditCard } from "../portal-settings";
import { type Directory, approversForFund, effectiveTeamFunds, fundsFor } from "../teams";
import { FUNDS } from "./accounts";
import type { RoutingSettings } from "./workflow";

/**
 * Purchase Requests settings, put together from two places nobody edits by
 * hand: Google Groups (who chairs, vice-chairs and directs each team) and
 * Portal Settings (which fund each team charges, and IAR's cards). A team
 * with no chair, or a fund no team charges, is safe: its requests go to the
 * vice chair, the director, or finance review.
 */

export type { CreditCard } from "../portal-settings";

export type PurchaseContext = {
  dir: Directory;
  /** Team group → fund (saved choices, then suggestions). */
  teamFunds: Record<string, string>;
  cards: CreditCard[];
  routing: RoutingSettings;
};

function parseThreshold(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function purchaseContext(): Promise<PurchaseContext> {
  const [dir, s] = await Promise.all([directory(), portalSettings()]);
  const teamFunds = effectiveTeamFunds(dir, s.teamFunds, FUNDS);
  return {
    dir,
    teamFunds,
    cards: s.cards,
    routing: {
      approversFor: (fund) => approversForFund(dir, teamFunds, fund),
      // Not decided yet. Unset means no executive step. Dev shows the step at $2,500.
      executiveThreshold: parseThreshold(process.env.PO_EXECUTIVE_THRESHOLD) ?? (isDevAuth() ? 2500 : null),
    },
  };
}

export function cardsHeldBy(ctx: PurchaseContext, email: string): CreditCard[] {
  return ctx.cards.filter((c) => c.holderEmail.toLowerCase() === email.toLowerCase());
}

/** A person's funds: to request from, chair, oversee and direct. */
export function personFunds(ctx: PurchaseContext, email: string) {
  return fundsFor(ctx.dir, ctx.teamFunds, email);
}
