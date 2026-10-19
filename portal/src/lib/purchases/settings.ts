import "server-only";
import { isDevAuth } from "../dev";
import { FUNDS } from "./accounts";
import type { RoutingSettings } from "./workflow";

/**
 * Purchase Requests settings: who approves each fund, IAR's credit cards, and
 * the executive-approval threshold.
 *
 * The office still has to confirm the real values (open questions in
 * docs/purchase-requests-plan.md: the 23 chair approvers and a backup for each,
 * the 12-card list, the dollar threshold). Until then the production lists are
 * empty, which is safe: a fund with no chair on file goes straight to finance
 * review, and nobody can submit card receipts for a card that isn't listed.
 * Later these move to the database, edited from Portal Settings.
 */

export type FundApprovers = { chair?: string; backup?: string };

/** Fund name → chair and backup approver emails (@islam1.org). */
const FUND_APPROVERS: Record<string, FundApprovers> = {
  // "Youth Expenses": { chair: "youth.chair@islam1.org", backup: "youth.backup@islam1.org" },
};

export type CreditCard = { last4: string; holderEmail: string; holderName: string; fund: string };

/** IAR credit cards. Never store more than the last four digits. */
const CREDIT_CARDS: CreditCard[] = [
  // { last4: "2093", holderEmail: "someone@islam1.org", holderName: "…", fund: "Imam's Office Fund Expenses" },
];

// ---- Development: sample approvers and cards ---------------------------

const DEV_APPROVERS: Record<string, FundApprovers> = Object.fromEntries(
  FUNDS.map((f) => [f, { chair: "chair@dev.local", backup: "office@dev.local" }]),
);
DEV_APPROVERS["Social & Welfare"] = { chair: "sw@dev.local", backup: "chair@dev.local" };

const DEV_CARDS: CreditCard[] = [
  { last4: "2093", holderEmail: "volunteer@dev.local", holderName: "Sample Volunteer", fund: "Imam's Office Fund Expenses" },
  { last4: "8890", holderEmail: "finance@dev.local", holderName: "Sample Finance", fund: "Cleaning Committee Expenses" },
  { last4: "4120", holderEmail: "chair@dev.local", holderName: "Sample Chair", fund: "Youth Expenses" },
];

// ---- Accessors -----------------------------------------------------------

function parseThreshold(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function routingSettings(): RoutingSettings {
  const dev = isDevAuth();
  const approvers = dev ? DEV_APPROVERS : FUND_APPROVERS;
  return {
    approversFor: (fund) => approvers[fund] ?? {},
    // Not decided yet. Unset means no executive step. Dev shows the step at $2,500.
    executiveThreshold: parseThreshold(process.env.PO_EXECUTIVE_THRESHOLD) ?? (dev ? 2500 : null),
  };
}

export function creditCards(): CreditCard[] {
  return isDevAuth() ? DEV_CARDS : CREDIT_CARDS;
}

export function cardsHeldBy(email: string): CreditCard[] {
  return creditCards().filter((c) => c.holderEmail.toLowerCase() === email.toLowerCase());
}
