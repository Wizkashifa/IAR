import "server-only";
import { devNames, isDevAuth } from "./dev";
import { delegatedToken } from "./google";
import { directory } from "./groups";
import { type NameResolver, NameCache, makeNameResolver, prettifyEmail } from "./name-cache";
import { isPillarGroup, isTeamGroup } from "./teams";
import type { PersonOption } from "@/components/PeoplePicker";
import { lc } from "./text";

/**
 * People's names instead of their addresses, read from IAR's Workspace
 * directory. Nothing is stored: names are cached for 15 minutes, like the
 * group directory. Team and pillar groups get their group's name.
 *
 * The lookup impersonates the same read-only directory user as groups.ts and
 * asks only for the public directory view (`viewType=domain_public`), so that
 * user needs no user-management privilege. Setup is in docs/setup.md §4.
 */
const SCOPE = "https://www.googleapis.com/auth/admin.directory.user.readonly";
/** Lookups at a time, to stay well inside the Admin SDK's rate limit. */
const PARALLEL = 8;

async function fetchUserName(token: string, email: string): Promise<string | null> {
  const url = new URL(`https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}`);
  url.searchParams.set("viewType", "domain_public");
  url.searchParams.set("fields", "name/fullName");
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404 || res.status === 403) return null; // not a person in the directory (an outside address, or a group)
  if (!res.ok) throw new Error(`Name lookup failed: ${res.status}`);
  const body = (await res.json()) as { name?: { fullName?: string } };
  return body.name?.fullName?.trim() || null;
}

async function fetchFromWorkspace(emails: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const groups = emails.filter((e) => isTeamGroup(e) || isPillarGroup(e));
  if (groups.length) {
    const dir = await directory();
    for (const e of groups) out[e] = [...dir.teams, ...dir.pillars].find((g) => g.email === e)?.name ?? null;
  }
  const people = emails.filter((e) => !(e in out));
  if (!people.length) return out;
  const subject = process.env.DIRECTORY_ADMIN_SUBJECT;
  if (!subject) throw new Error("DIRECTORY_ADMIN_SUBJECT is not set.");
  const token = await delegatedToken(subject, SCOPE);
  for (let i = 0; i < people.length; i += PARALLEL) {
    const chunk = people.slice(i, i + PARALLEL);
    const found = await Promise.all(chunk.map((e) => fetchUserName(token, e).catch((err) => (console.error("name lookup failed", e, err), null))));
    chunk.forEach((e, j) => (out[e] = found[j]));
  }
  return out;
}

const g = globalThis as unknown as { __iarNames?: NameCache };
const cache = (g.__iarNames ??= new NameCache(fetchFromWorkspace));

/** Names for these addresses, by lowercased address. Never throws; unknown addresses get a readable fallback. */
export async function namesFor(emails: string[]): Promise<Map<string, string>> {
  if (isDevAuth()) {
    const dev = devNames();
    return new Map([...new Set(emails.map(lc))].map((e) => [e, dev.get(e) ?? prettifyEmail(e)]));
  }
  return cache.namesFor(emails);
}

export async function nameOf(email: string): Promise<string> {
  return (await namesFor([email])).get(lc(email)) ?? prettifyEmail(email);
}

/** Look up every address a page shows in one go, then pass the result to sentence builders such as nextStepText. */
export async function nameResolver(emails: string[]): Promise<NameResolver> {
  return makeNameResolver(await namesFor(emails));
}

export { type NameResolver, makeNameResolver, prettifyEmail } from "./name-cache";

/** People a task or request can be handed to, by name, with "Me (…)" for the person looking. */
export function peopleOptions(emails: string[], me: string, names: (email: string) => string): PersonOption[] {
  return emails.map((e) => ({ email: e, name: e.toLowerCase() === me.toLowerCase() ? `Me (${names(e)})` : names(e) }));
}
