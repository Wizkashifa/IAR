/**
 * Who approves and oversees each fund, and which IAR cards exist. Real names
 * and emails never go in this repo (it's public): production reads them from
 * a JSON file outside git (PORTAL_ROSTER_FILE, a Secret Manager secret
 * mounted on Cloud Run; see docs/beta-launch.md). Plain functions so the
 * checks can be tested.
 *
 * {
 *   "funds": { "Youth Expenses": { "committee": "Youth", "chair": "x@islam1.org", "backup": "y@islam1.org" } },
 *   "directors": [{ "name": "…", "email": "z@islam1.org", "funds": ["Youth Expenses", "Women Expenses"] }],
 *   "cards": [{ "last4": "2093", "holderEmail": "…", "holderName": "…", "fund": "Imam's Office Fund Expenses" }]
 * }
 *
 * Directors can see their funds' requests and take the chair step on them
 * (see workflow.ts). A fund with no chair goes to its director, or straight
 * to finance review if it has none. Anything that fails
 * a check is left out and reported, never guessed.
 */

export type FundApprovers = { committee?: string; chair?: string; backup?: string };
export type Director = { name: string; email: string; funds: string[] };
export type CreditCard = { last4: string; holderEmail: string; holderName: string; fund: string };
export type Roster = { funds: Record<string, FundApprovers>; directors: Director[]; cards: CreditCard[] };

export const EMPTY_ROSTER: Roster = { funds: {}, directors: [], cards: [] };

const EMAIL = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+$/;

export function parseRoster(raw: unknown, ctx: { funds: string[]; domain: string }): { roster: Roster; problems: string[] } {
  const problems: string[] = [];
  const roster: Roster = { funds: {}, directors: [], cards: [] };
  if (!raw || typeof raw !== "object") return { roster, problems: ["Roster isn't a JSON object."] };
  const r = raw as Record<string, unknown>;
  const known = new Set(ctx.funds);
  const email = (v: unknown, where: string): string | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const e = String(v).trim().toLowerCase();
    if (EMAIL.test(e) && e.endsWith(`@${ctx.domain}`)) return e;
    problems.push(`${where}: "${String(v)}" isn't an @${ctx.domain} address; left out.`);
    return undefined;
  };

  for (const [fund, v] of Object.entries((r.funds as Record<string, unknown>) ?? {})) {
    if (!known.has(fund)) {
      problems.push(`Fund "${fund}" isn't in the chart of accounts; left out.`);
      continue;
    }
    const f = (v ?? {}) as Record<string, unknown>;
    const chair = email(f.chair, `${fund} chair`);
    let backup = email(f.backup, `${fund} backup`);
    if (backup && backup === chair) {
      problems.push(`${fund}: backup is the same person as the chair; backup left out.`);
      backup = undefined;
    }
    roster.funds[fund] = { committee: f.committee ? String(f.committee) : undefined, chair, backup };
  }

  for (const [i, v] of (Array.isArray(r.directors) ? r.directors : []).entries()) {
    const d = (v ?? {}) as Record<string, unknown>;
    const e = email(d.email, `Director ${String(d.name ?? i + 1)}`);
    const funds = (Array.isArray(d.funds) ? d.funds.map(String) : []).filter((f) => {
      if (known.has(f)) return true;
      problems.push(`Director ${String(d.name ?? e)}: fund "${f}" isn't in the chart of accounts; left out.`);
      return false;
    });
    if (e && funds.length) roster.directors.push({ name: String(d.name ?? e), email: e, funds });
  }

  for (const v of Array.isArray(r.cards) ? r.cards : []) {
    const c = (v ?? {}) as Record<string, unknown>;
    const last4 = String(c.last4 ?? "");
    const holder = email(c.holderEmail, `Card ···${last4}`);
    if (!/^\d{4}$/.test(last4)) problems.push(`A card's "last4" must be exactly four digits (never the full number); left out.`);
    else if (!known.has(String(c.fund))) problems.push(`Card ···${last4}: fund "${String(c.fund)}" isn't in the chart of accounts; left out.`);
    else if (holder) roster.cards.push({ last4, holderEmail: holder, holderName: String(c.holderName ?? holder), fund: String(c.fund) });
  }
  return { roster, problems };
}

/** Directors of a fund, by email. */
export function directorsOf(roster: Roster, fund: string): string[] {
  return roster.directors.filter((d) => d.funds.includes(fund)).map((d) => d.email);
}

/** Funds a person directs (they can take the chair step on them). */
export function fundsDirectedBy(roster: Roster, email: string): string[] {
  const e = email.toLowerCase();
  return [...new Set(roster.directors.filter((d) => d.email === e).flatMap((d) => d.funds))].sort();
}

/** Funds a person can see every request for: ones they chair or back up, and ones they direct. */
export function fundsOverseenBy(roster: Roster, email: string): string[] {
  const e = email.toLowerCase();
  const out = new Set<string>();
  for (const [fund, a] of Object.entries(roster.funds)) if (a.chair === e || a.backup === e) out.add(fund);
  for (const d of roster.directors) if (d.email === e) d.funds.forEach((f) => out.add(f));
  return [...out].sort();
}
