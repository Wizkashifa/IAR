import type { Role } from "./org";

/**
 * Committees and teams, read from Google Groups. Nothing here names a person,
 * a team or a pillar: the lists come from Google, so people are assigned in
 * Google Admin and never in code or files.
 *
 * - A team group (portal-team-<slug>@) is one committee or team. Owner = chair,
 *   Manager = vice chair, Member = member. Its display name is the team's name.
 * - A pillar group (portal-pillar-<slug>@) is one director's set of
 *   committees. Owner = director; its members are team groups.
 * - Role groups (portal-role-<slug>@) are portal-wide jobs: see org.ts.
 *
 * Committees and teams work the same way. A person can be on several, with a
 * different role in each; a chair role never carries over to another team.
 */

export const TEAM_PREFIX = "portal-team-";
export const PILLAR_PREFIX = "portal-pillar-";
export const ROLE_PREFIX = "portal-role-";

export type GroupMember = { email: string; role: "OWNER" | "MANAGER" | "MEMBER"; type: "USER" | "GROUP" };
export type DirectoryGroup = { email: string; name: string; members: GroupMember[] };
/** Every team and pillar group with its members, as read from Google. */
export type Directory = { teams: DirectoryGroup[]; pillars: DirectoryGroup[] };

export const EMPTY_DIRECTORY: Directory = { teams: [], pillars: [] };

export type TeamRole = "chair" | "vice" | "member";
export type Membership = { name: string; group: string; role: TeamRole };

const lc = (s: string) => s.trim().toLowerCase();

/**
 * A slug from a name: lowercase, apostrophes, "&" and the word "Committee"
 * dropped, words joined with hyphens. "Women's Committee" → "women". Used for
 * pillar groups and any team that isn't in TEAM_SLUGS.
 */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/['’]/g, "")
    .replace(/&/g, " ")
    .replace(/\bcommittee\b/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The launch teams' group slugs, as IAR named them (docs/setup.md §6). Some
 * are short ("IT Services" → tech), so they aren't worked out from the name.
 * The portal itself reads every team from Google by its address; this list
 * is for go-live, which creates the groups, and for sample data.
 */
export const TEAM_SLUGS: Record<string, string> = {
  Administration: "administration",
  "Al-Furqan School": "al-furqan-school",
  "Al-Iman School": "al-iman-school",
  "An-Noor School": "an-noor-school",
  Cemetery: "cemetery",
  Cleaning: "cleaning",
  Construction: "construction",
  "Da'wah": "dawah",
  Education: "education",
  "Events Committee": "events",
  "Facility Maintenance": "maintenance",
  Fundraising: "fundraising",
  "Health & Wellness": "hw",
  "IAR Cafe": "cafe",
  "Imam Office": "imams",
  "IT Services": "tech",
  Marketing: "marketing",
  "Older Adult Community": "seniors",
  "Page Road": "page",
  "Safety & Security": "security",
  Shura: "shura",
  "Social & Welfare": "welfare",
  "Sports & Recreation": "sports",
  Volunteer: "volunteer",
  "Women's Committee": "women",
  Youth: "youth",
};

/** A team's slug: from TEAM_SLUGS, or worked out from its name for a team added later. */
export const teamSlug = (name: string) => TEAM_SLUGS[name] ?? slugOf(name);
export const teamGroupEmail = (name: string, domain: string) => `${TEAM_PREFIX}${teamSlug(name)}@${domain}`;
export const isTeamGroup = (email: string) => lc(email).startsWith(TEAM_PREFIX);
export const isPillarGroup = (email: string) => lc(email).startsWith(PILLAR_PREFIX);
/** The slug part of a team or pillar group's address. */
export const groupSlug = (email: string) => lc(email).split("@")[0].replace(TEAM_PREFIX, "").replace(PILLAR_PREFIX, "");

const ROLE_OF: Record<GroupMember["role"], TeamRole> = { OWNER: "chair", MANAGER: "vice", MEMBER: "member" };

/** The teams a person is on, with their role in each. */
export function membershipsOf(dir: Directory, email: string): Membership[] {
  const e = lc(email);
  const out: Membership[] = [];
  for (const g of dir.teams) {
    const m = g.members.find((x) => x.type === "USER" && lc(x.email) === e);
    if (m) out.push({ name: g.name, group: lc(g.email), role: ROLE_OF[m.role] });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Team groups a person directs: the member groups of every pillar they own. */
export function directedTeamGroups(dir: Directory, email: string): string[] {
  const e = lc(email);
  const out = new Set<string>();
  for (const p of dir.pillars) {
    if (!p.members.some((m) => m.type === "USER" && m.role === "OWNER" && lc(m.email) === e)) continue;
    for (const m of p.members) if (m.type === "GROUP" && isTeamGroup(m.email)) out.add(lc(m.email));
  }
  return [...out].sort();
}

/** A team's chairs, vice chairs and directors, by email. */
export function teamPeople(dir: Directory, teamGroup: string): { chairs: string[]; vices: string[]; directors: string[]; memberCount: number } {
  const g = dir.teams.find((t) => lc(t.email) === lc(teamGroup));
  const users = (g?.members ?? []).filter((m) => m.type === "USER");
  const byRole = (r: GroupMember["role"]) => users.filter((m) => m.role === r).map((m) => lc(m.email)).sort();
  const directors = new Set<string>();
  for (const p of dir.pillars) {
    if (!p.members.some((m) => m.type === "GROUP" && lc(m.email) === lc(teamGroup))) continue;
    for (const m of p.members) if (m.type === "USER" && m.role === "OWNER") directors.add(lc(m.email));
  }
  return { chairs: byRole("OWNER"), vices: byRole("MANAGER"), directors: [...directors].sort(), memberCount: users.length };
}

/** Pillars and their directors, for the settings page. */
export function pillarsOf(dir: Directory): { name: string; group: string; directors: string[]; teams: string[] }[] {
  return dir.pillars
    .map((p) => ({
      name: p.name,
      group: lc(p.email),
      directors: p.members.filter((m) => m.type === "USER" && m.role === "OWNER").map((m) => lc(m.email)).sort(),
      teams: p.members.filter((m) => m.type === "GROUP" && isTeamGroup(m.email)).map((m) => lc(m.email)).sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Teams that also switch on a team's queue, by slug. Membership at any level
 * counts. These are the only team names in the code, because they turn on
 * modules; renaming one of these teams means changing it here.
 */
export const QUEUE_ROLES: Record<string, Role[]> = {
  marketing: ["marketing"],
  maintenance: ["facilities"],
  security: ["security"],
  welfare: ["sw"],
  shura: ["shura"],
  tech: ["it", "av"],
};

/** Roles that come from a person's teams: queue roles, and "chairs" for anyone who chairs a team. */
export function teamRoles(memberships: Membership[]): Role[] {
  const out = new Set<Role>();
  for (const m of memberships) {
    for (const r of QUEUE_ROLES[groupSlug(m.group)] ?? []) out.add(r);
    if (m.role === "chair") out.add("chairs");
  }
  return [...out];
}

// ---- Funds ---------------------------------------------------------------
// Which fund a team charges is a Portal Settings choice (team group → fund).
// Until an admin saves one, the portal suggests the fund whose name matches.

const STOP = new Set(["expenses", "expense", "fund", "committee", "and", "the", "of"]);
const ABBR: Record<string, string> = { rd: "road", st: "street" };
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => ABBR[w] ?? w)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .filter((w) => !STOP.has(w));

/** The fund whose name contains every word of the team's name, if exactly one does. */
export function suggestFund(teamName: string, funds: string[]): string | undefined {
  const want = words(teamName);
  if (!want.length) return undefined;
  const hits = funds.filter((f) => {
    const have = new Set(words(f));
    return want.every((w) => have.has(w));
  });
  return hits.length === 1 ? hits[0] : undefined;
}

/** Saved choices first, then suggestions. Returns team group → fund. */
export function effectiveTeamFunds(dir: Directory, saved: Record<string, string>, funds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of dir.teams) {
    const g = lc(t.email);
    const f = saved[g] ?? suggestFund(t.name, funds);
    if (f && funds.includes(f)) out[g] = f;
  }
  return out;
}

/** Who approves a fund's requests: the chairs, vice chairs and directors of every team that charges it. */
export function approversForFund(dir: Directory, teamFunds: Record<string, string>, fund: string): { chairs: string[]; backups: string[]; directors: string[] } {
  const chairs = new Set<string>(), backups = new Set<string>(), directors = new Set<string>();
  for (const [group, f] of Object.entries(teamFunds)) {
    if (f !== fund) continue;
    const p = teamPeople(dir, group);
    p.chairs.forEach((x) => chairs.add(x));
    p.vices.forEach((x) => backups.add(x));
    p.directors.forEach((x) => directors.add(x));
  }
  return { chairs: [...chairs].sort(), backups: [...backups].sort(), directors: [...directors].sort() };
}

/** A person's funds: the ones they may request from, chair, oversee (chair, vice or direct) and direct. */
export function fundsFor(dir: Directory, teamFunds: Record<string, string>, email: string) {
  const mine = membershipsOf(dir, email);
  const directed = directedTeamGroups(dir, email);
  const fundOf = (g: string) => teamFunds[g];
  const set = (gs: string[]) => [...new Set(gs.map(fundOf).filter((f): f is string => Boolean(f)))].sort();
  return {
    request: set([...mine.map((m) => m.group), ...directed]),
    chairs: set(mine.filter((m) => m.role === "chair").map((m) => m.group)),
    oversees: set([...mine.filter((m) => m.role !== "member").map((m) => m.group), ...directed]),
    directs: set(directed),
  };
}

/** Funds a person may charge: their teams' funds and the ones they direct. The office and finance submit for any fund. */
export function requestableFunds(own: string[], roles: Role[], allFunds: string[]): string[] {
  return roles.includes("office") || roles.includes("finance") ? allFunds : own;
}
