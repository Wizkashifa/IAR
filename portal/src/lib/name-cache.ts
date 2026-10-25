/**
 * People's names for addresses, without any Google calls: the fallback that
 * turns an address into a readable name, a resolver pages hand to the
 * functions that write sentences, and the cache that `names.ts` fills from
 * IAR's Workspace directory. Plain functions and a class, tested in
 * names.test.ts.
 */
import { PILLAR_PREFIX, ROLE_PREFIX, TEAM_PREFIX } from "./teams";

const lc = (s: string) => s.trim().toLowerCase();

/**
 * A readable name from an address alone: "fatima.ahmed@x.org" → "Fatima Ahmed",
 * "portal-team-social-welfare@x.org" → "Social Welfare". Numbers in the
 * address are dropped ("amina.412.rahman" → "Amina Rahman").
 */
export function prettifyEmail(email: string): string {
  const local = lc(email).split("@")[0].replace(TEAM_PREFIX, "").replace(PILLAR_PREFIX, "").replace(ROLE_PREFIX, "");
  const words = local.split(/[._+\-]+/).filter((w) => w && !/^\d+$/.test(w));
  if (!words.length) return email.trim();
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

/** Names by lowercased address. */
export type NameMap = ReadonlyMap<string, string>;

/** A sync lookup for pages and sentence builders: the known name, or the readable fallback. */
export type NameResolver = (email: string) => string;

export function makeNameResolver(names: NameMap | Record<string, string>): NameResolver {
  const map: NameMap = names instanceof Map ? names : new Map(Object.entries(names).map(([k, v]) => [lc(k), v]));
  return (email) => map.get(lc(email)) ?? prettifyEmail(email);
}

/** Look up a batch of addresses; a missing or null entry means "no name found". */
export type FetchNames = (emails: string[]) => Promise<Record<string, string | null | undefined>>;

export type NameCacheOptions = {
  /** How long a found name is kept (15 minutes, like the group directory). */
  ttlMs?: number;
  /** How long to wait before asking again after a failure or no name. */
  retryMs?: number;
  now?: () => number;
};

/**
 * Names cached per address. Concurrent requests for the same address share
 * one lookup. It never throws: a failed lookup gives the readable fallback
 * and is retried after `retryMs`.
 */
export class NameCache {
  private readonly ttlMs: number;
  private readonly retryMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, { name: string; until: number }>();
  private readonly loading = new Map<string, Promise<string>>();

  constructor(private readonly fetchNames: FetchNames, o: NameCacheOptions = {}) {
    this.ttlMs = o.ttlMs ?? 15 * 60 * 1000;
    this.retryMs = o.retryMs ?? 60 * 1000;
    this.now = o.now ?? Date.now;
  }

  async namesFor(emails: string[]): Promise<Map<string, string>> {
    const wanted = [...new Set(emails.map(lc).filter(Boolean))];
    const out = new Map<string, string>();
    const missing: string[] = [];
    for (const e of wanted) {
      const hit = this.entries.get(e);
      if (hit && hit.until > this.now()) out.set(e, hit.name);
      else if (!this.loading.has(e)) missing.push(e);
    }
    if (missing.length) {
      const batch = this.fetchNames(missing).catch(() => ({}) as Record<string, string | null | undefined>);
      for (const e of missing) {
        const one = batch.then((found) => {
          const name = found[e]?.trim();
          this.entries.set(e, name ? { name, until: this.now() + this.ttlMs } : { name: prettifyEmail(e), until: this.now() + this.retryMs });
          return name || prettifyEmail(e);
        });
        this.loading.set(e, one);
        void one.finally(() => this.loading.delete(e));
      }
    }
    await Promise.all(wanted.filter((e) => !out.has(e)).map(async (e) => out.set(e, await this.loading.get(e)!)));
    return out;
  }

  async nameOf(email: string): Promise<string> {
    return (await this.namesFor([email])).get(lc(email)) ?? prettifyEmail(email);
  }
}
