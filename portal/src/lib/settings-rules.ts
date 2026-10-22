/**
 * Checks for what admins save in Portal Settings: which fund each team
 * charges, and IAR's credit cards. Plain functions so they can be tested.
 */

export type CreditCard = { last4: string; holderEmail: string; holderName: string; fund: string };
export type PortalSettings = {
  /** Team group → fund it charges. Teams not listed use the suggested fund. */
  teamFunds: Record<string, string>;
  cards: CreditCard[];
  updatedAt?: string;
  updatedBy?: string;
};

export const EMPTY_SETTINGS: PortalSettings = { teamFunds: {}, cards: [] };

const EMAIL = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+$/;

/** A card to add, checked. Only the last four digits are ever stored. */
export function checkCard(
  raw: { last4?: unknown; holderEmail?: unknown; holderName?: unknown; fund?: unknown },
  ctx: { funds: string[]; domain: string; existing: CreditCard[] },
): { ok: true; card: CreditCard } | { ok: false; error: string } {
  const last4 = String(raw.last4 ?? "").trim();
  const holderEmail = String(raw.holderEmail ?? "").trim().toLowerCase();
  const holderName = String(raw.holderName ?? "").trim().slice(0, 120);
  const fund = String(raw.fund ?? "");
  if (!/^\d{4}$/.test(last4)) return { ok: false, error: "Enter only the card's last four digits, never the full number." };
  if (ctx.existing.some((c) => c.last4 === last4)) return { ok: false, error: `A card ending ${last4} is already listed.` };
  if (!EMAIL.test(holderEmail) || !holderEmail.endsWith(`@${ctx.domain}`)) return { ok: false, error: `The cardholder needs an @${ctx.domain} address.` };
  if (!holderName) return { ok: false, error: "Enter the cardholder's name." };
  if (!ctx.funds.includes(fund)) return { ok: false, error: "Choose the fund the card is charged to." };
  return { ok: true, card: { last4, holderEmail, holderName, fund } };
}

/** A team's fund choice, checked. An empty fund clears the choice so the suggestion applies again. */
export function checkTeamFund(group: string, fund: string, ctx: { funds: string[]; teamGroups: string[] }): { ok: true } | { ok: false; error: string } {
  if (!ctx.teamGroups.includes(group.toLowerCase())) return { ok: false, error: "That team isn't in Google Groups any more. Reload the page." };
  if (fund && !ctx.funds.includes(fund)) return { ok: false, error: "Choose a fund from the chart of accounts." };
  return { ok: true };
}
