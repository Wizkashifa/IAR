import "server-only";
import { DEV_PERSONAS, devDirectory, isDevAuth } from "./dev";
import { ORG } from "./org";
import { delegatedToken } from "./google";
import { reportFailure, reportOk } from "./health";
import { type Directory, type DirectoryGroup, type GroupMember, EMPTY_DIRECTORY, PILLAR_PREFIX, ROLE_PREFIX, TEAM_PREFIX, groupDisplayName, portalPeopleFrom } from "./teams";

/**
 * Look up a user's Google Groups through the Admin SDK Directory API,
 * impersonating a Workspace user that can only read groups (see google.ts).
 */
const SCOPE = "https://www.googleapis.com/auth/admin.directory.group.readonly";

async function directoryToken(): Promise<string> {
  const subject = process.env.DIRECTORY_ADMIN_SUBJECT;
  if (!subject) throw new Error("DIRECTORY_ADMIN_SUBJECT is not set.");
  return delegatedToken(subject, SCOPE);
}

/** Direct group memberships of a user (group emails, lowercased). */
export async function lookupGroups(email: string): Promise<string[]> {
  const token = await directoryToken();
  const groups: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://admin.googleapis.com/admin/directory/v1/groups");
    url.searchParams.set("userKey", email);
    url.searchParams.set("maxResults", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Directory lookup failed: ${res.status}`);
    const body = (await res.json()) as { groups?: { email: string }[]; nextPageToken?: string };
    for (const g of body.groups ?? []) groups.push(g.email.toLowerCase());
    pageToken = body.nextPageToken;
  } while (pageToken);
  return groups;
}

// ---- Teams and pillars ----------------------------------------------------

type ApiGroup = { email: string; name?: string };
type ApiMember = { email?: string; role?: string; type?: string };

async function listAll<T>(token: string, url: URL, key: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Directory lookup failed: ${res.status}`);
    const body = (await res.json()) as Record<string, unknown> & { nextPageToken?: string };
    out.push(...((body[key] as T[] | undefined) ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out;
}

async function groupsWithPrefix(token: string, prefix: string): Promise<DirectoryGroup[]> {
  const url = new URL("https://admin.googleapis.com/admin/directory/v1/groups");
  url.searchParams.set("customer", "my_customer");
  url.searchParams.set("query", `email:${prefix}*`);
  url.searchParams.set("maxResults", "200");
  const groups = (await listAll<ApiGroup>(token, url, "groups")).filter((g) => g.email.toLowerCase().startsWith(prefix));
  return Promise.all(
    groups.map(async (g) => {
      const m = new URL(`https://admin.googleapis.com/admin/directory/v1/groups/${encodeURIComponent(g.email)}/members`);
      m.searchParams.set("maxResults", "200");
      const members = (await listAll<ApiMember>(token, m, "members"))
        .filter((x) => x.email && (x.type === "USER" || x.type === "GROUP"))
        .map((x) => ({ email: x.email!.toLowerCase(), role: (x.role === "OWNER" || x.role === "MANAGER" ? x.role : "MEMBER") as GroupMember["role"], type: x.type as GroupMember["type"] }));
      return { email: g.email.toLowerCase(), name: groupDisplayName(g.name ?? "") || g.email, members };
    }),
  );
}

const DIRECTORY_REFRESH_MS = 15 * 60 * 1000;
const cache = globalThis as unknown as { __iarDirectory?: { at: number; dir: Directory; loading?: Promise<Directory> } };

/**
 * Every team and pillar group with its members and their roles, refreshed
 * every 15 minutes (the same as a person's own groups). A failed refresh keeps
 * the last good copy; with none, nobody is on a team and every request goes to
 * finance review, which is safe.
 */
export async function directory(): Promise<Directory> {
  if (isDevAuth()) return devDirectory();
  const c = cache.__iarDirectory;
  if (c && Date.now() - c.at < DIRECTORY_REFRESH_MS) return c.dir;
  if (c?.loading) return c.loading;
  const loading = (async () => {
    try {
      const token = await directoryToken();
      const [teams, pillars] = await Promise.all([groupsWithPrefix(token, TEAM_PREFIX), groupsWithPrefix(token, PILLAR_PREFIX)]);
      const dir = { teams, pillars };
      cache.__iarDirectory = { at: Date.now(), dir };
      reportOk("directory");
      return dir;
    } catch (err) {
      console.error("team directory lookup failed", err);
      reportFailure("directory", err);
      const dir = c?.dir ?? EMPTY_DIRECTORY;
      // Try again in a minute rather than on every page load.
      cache.__iarDirectory = { at: Date.now() - DIRECTORY_REFRESH_MS + 60_000, dir };
      return dir;
    }
  })();
  cache.__iarDirectory = { at: c?.at ?? 0, dir: c?.dir ?? EMPTY_DIRECTORY, loading };
  return loading;
}

const peopleCache = globalThis as unknown as { __iarPortalPeople?: { at: number; people: string[] } };

/**
 * Everyone who can use the portal, as addresses, for an admin picking whom to
 * sign in as (lib/teams.ts `portalPeopleFrom`). Refreshed every 15 minutes.
 * Someone in the beta group only through another group isn't listed.
 */
export async function portalPeople(): Promise<string[]> {
  if (isDevAuth()) return DEV_PERSONAS.map((p) => p.email);
  const c = peopleCache.__iarPortalPeople;
  if (c && Date.now() - c.at < DIRECTORY_REFRESH_MS) return c.people;
  const [dir, roles] = await Promise.all([directory(), directoryToken().then((t) => groupsWithPrefix(t, ROLE_PREFIX))]);
  const gate = process.env.PORTAL_ACCESS_GROUP?.trim().toLowerCase();
  const people = portalPeopleFrom([...dir.teams, ...dir.pillars, ...roles], gate ? { group: gate, admins: String(ORG.roleGroups.admins) } : undefined);
  peopleCache.__iarPortalPeople = { at: Date.now(), people };
  return people;
}
