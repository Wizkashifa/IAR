import "server-only";
import { readFileSync } from "node:fs";
import { isDevAuth } from "../dev";
import { ORG } from "../org";
import { FUNDS } from "./accounts";
import { type CreditCard, EMPTY_ROSTER, type Roster, directorsOf, fundsDirectedBy, fundsOverseenBy, parseRoster } from "./roster";
import type { RoutingSettings } from "./workflow";

/**
 * Purchase Requests settings: who approves and oversees each fund, IAR's
 * credit cards, and the executive-approval threshold.
 *
 * People live in a roster file outside the repo (see roster.ts), read once
 * per server from PORTAL_ROSTER_FILE. No file, or a fund missing from it, is
 * safe: that fund goes straight to finance review, and nobody can submit
 * card receipts for a card that isn't listed. Later this moves to the
 * database, edited from Portal Settings.
 */

export type { CreditCard } from "./roster";

// ---- Development: sample approvers, director and cards -----------------

function devRoster(): Roster {
  const funds: Roster["funds"] = Object.fromEntries(FUNDS.map((f) => [f, { chair: "chair@dev.local", backup: "office@dev.local" }]));
  funds["Social & Welfare"] = { chair: "sw@dev.local", backup: "chair@dev.local" };
  return {
    funds,
    directors: [{ name: "Sample Director", email: "director@dev.local", funds: ["Youth Expenses", "Women Expenses", "Sports & Recreation Expenses", "Senior Committee Expenses"] }],
    cards: [
      { last4: "2093", holderEmail: "volunteer@dev.local", holderName: "Sample Volunteer", fund: "Imam's Office Fund Expenses" },
      { last4: "8890", holderEmail: "finance@dev.local", holderName: "Sample Finance", fund: "Cleaning Committee Expenses" },
      { last4: "4120", holderEmail: "chair@dev.local", holderName: "Sample Chair", fund: "Youth Expenses" },
    ],
  };
}

// ---- Production: the roster file --------------------------------------

let loaded: Roster | null = null;

export function roster(): Roster {
  if (isDevAuth()) return devRoster();
  if (loaded) return loaded;
  const path = process.env.PORTAL_ROSTER_FILE;
  if (!path) {
    console.warn("PORTAL_ROSTER_FILE is not set: every purchase request goes to finance review and no card receipts can be submitted.");
    return (loaded = EMPTY_ROSTER);
  }
  try {
    const { roster: r, problems } = parseRoster(JSON.parse(readFileSync(path, "utf8")), { funds: FUNDS, domain: ORG.domain });
    for (const p of problems) console.error(`roster: ${p}`);
    return (loaded = r);
  } catch (err) {
    console.error("roster file couldn't be read; falling back to finance review for everything", err);
    return (loaded = EMPTY_ROSTER);
  }
}

// ---- Accessors -----------------------------------------------------------

function parseThreshold(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function routingSettings(): RoutingSettings {
  const r = roster();
  return {
    approversFor: (fund) => {
      const a = r.funds[fund];
      return { chair: a?.chair, backup: a?.backup, directors: directorsOf(r, fund) };
    },
    // Not decided yet. Unset means no executive step. Dev shows the step at $2,500.
    executiveThreshold: parseThreshold(process.env.PO_EXECUTIVE_THRESHOLD) ?? (isDevAuth() ? 2500 : null),
  };
}

export function creditCards(): CreditCard[] {
  return roster().cards;
}

export function cardsHeldBy(email: string): CreditCard[] {
  return creditCards().filter((c) => c.holderEmail.toLowerCase() === email.toLowerCase());
}

/** Funds this person directs: they can approve their committees' requests. */
export function fundsDirected(email: string): string[] {
  return fundsDirectedBy(roster(), email);
}

/** Funds whose requests this person can see: ones they chair or back up, and ones they direct. */
export function fundsOverseen(email: string): string[] {
  return fundsOverseenBy(roster(), email);
}
