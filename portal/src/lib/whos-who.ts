/**
 * Who's who: every committee and team from Google Groups, grouped by pillar,
 * with its chair, vice chair, what it handles and where to ask it for
 * something. Plain functions, so they can be tested; people and team names
 * come from Google at runtime, never from this file.
 */
import { groupSlug, teamPeople, type Directory } from "./teams";
import { lc } from "./text";

/** What a team's chair or an admin writes about the team (Portal Settings → teamInfo). */
export type TeamInfo = { description?: string; chatUrl?: string };

export type TeamEntry = {
  group: string;
  slug: string;
  name: string;
  pillar?: string;
  chairs: string[];
  vices: string[];
  directors: string[];
  memberCount: number;
  description?: string;
  chatUrl?: string;
};

export type PillarGroup = { name: string; teams: TeamEntry[] };

/** Every team, with its leaders and what it handles. */
export function teamEntries(dir: Directory, info: Record<string, TeamInfo> = {}): TeamEntry[] {
  const pillarOf = new Map<string, string>();
  for (const p of dir.pillars) for (const m of p.members) if (m.type === "GROUP") pillarOf.set(lc(m.email), p.name);
  return dir.teams
    .map((t) => {
      const group = lc(t.email);
      const people = teamPeople(dir, group);
      const i = info[group] ?? {};
      return { group, slug: groupSlug(group), name: t.name, pillar: pillarOf.get(group), ...people, description: i.description?.trim() || undefined, chatUrl: i.chatUrl || undefined };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Teams grouped by pillar, pillars in name order, then the teams no director oversees. */
export function byPillar(teams: TeamEntry[]): PillarGroup[] {
  const groups = new Map<string, TeamEntry[]>();
  for (const t of teams) {
    const k = t.pillar ?? "";
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const named = [...groups.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const out = named.map((name) => ({ name, teams: groups.get(name)! }));
  if (groups.has("")) out.push({ name: named.length ? "Other committees and teams" : "Committees and teams", teams: groups.get("")! });
  return out;
}

/**
 * Whether someone sees a team's full member list: its own members (any
 * role), the IAR office and portal admins. Everyone else sees the leaders,
 * which is what they need to ask for something.
 */
export function seesMembers(viewer: { email: string; roles: readonly string[]; teams: readonly { group: string }[] }, group: string): boolean {
  if (viewer.roles.includes("office") || viewer.roles.includes("admins")) return true;
  return viewer.teams.some((m) => lc(m.group) === lc(group));
}

/** Whether someone may change what a team handles and its Chat link: its chair or vice chair, or a portal admin. */
export function mayEditTeam(viewer: { email: string; actingRoles: readonly string[] }, team: Pick<TeamEntry, "chairs" | "vices">): boolean {
  if (viewer.actingRoles.includes("admins")) return true;
  const e = lc(viewer.email);
  return team.chairs.includes(e) || team.vices.includes(e);
}

export type RequestRoute = { href: string; label: string };

/**
 * Where "Request something from this team" goes. Marketing takes marketing
 * requests; Facilities and IT take AV/IT/Maintenance requests. Every other
 * committee mostly gets involved through an event or a purchase, so it gets
 * both, by slug (the group's address, which go-live sets and doesn't change).
 */
export function requestRoutes(slug: string): RequestRoute[] {
  if (slug === "marketing") return [{ href: "/marketing/new", label: "Marketing request" }];
  if (slug === "maintenance" || slug === "tech") return [{ href: "/it-maintenance/new", label: "AV/IT/Maintenance" }];
  return [
    { href: "/events/new", label: "Event request" },
    { href: "/purchases/new", label: "Payment request" },
  ];
}

/**
 * Words people search with, by team slug, for teams whose name doesn't say
 * what they handle. Only the launch teams' slugs (lib/teams.ts TEAM_SLUGS);
 * a team's own description in Portal Settings is searched too.
 */
export const TEAM_KEYWORDS: Record<string, string[]> = {
  administration: ["office", "keys", "key", "room booking", "rooms", "mail", "front desk", "access", "badge", "door code"],
  maintenance: ["repair", "broken", "leak", "plumbing", "air conditioning", "ac", "heat", "heating", "lights", "light bulb", "door", "lock", "toilet", "wudu", "parking lot", "building"],
  tech: ["wifi", "wi-fi", "internet", "sound system", "sound", "microphone", "mic", "projector", "screen", "tv", "livestream", "live stream", "streaming", "computer", "laptop", "printer", "email", "av", "a/v"],
  marketing: ["flyer", "graphic", "poster", "announcement", "website", "webpage", "social media", "instagram", "newsletter", "sign", "signs", "short link", "badge", "photos"],
  security: ["safety", "guard", "parking", "cameras", "emergency", "lockdown", "after hours"],
  welfare: ["zakat", "assistance", "help with bills", "rent help", "food pantry", "pantry", "family support", "social services"],
  events: ["event", "program", "dinner", "eid", "iftar", "festival", "banquet"],
  fundraising: ["donation", "donate", "fundraiser", "pledge", "campaign"],
  imams: ["imam", "nikah", "marriage", "counseling", "khutbah", "religious question", "fatwa", "shahada"],
  cemetery: ["burial", "janazah", "funeral", "grave", "plot"],
  cleaning: ["cleaning", "trash", "janitorial", "spill", "supplies"],
  youth: ["youth", "teens", "kids", "boys", "girls"],
  education: ["classes", "class", "quran", "arabic", "halaqa", "weekend school"],
  sports: ["gym", "basketball", "soccer", "sports", "fitness", "league"],
  women: ["sisters", "women"],
  seniors: ["seniors", "older adults", "elders"],
  volunteer: ["volunteer", "volunteering", "help out", "sign up"],
  hw: ["health", "clinic", "wellness", "blood drive", "flu shot"],
  cafe: ["cafe", "food", "catering", "coffee", "kitchen"],
  dawah: ["dawah", "da'wah", "outreach", "new muslims", "interfaith", "tours", "visitors"],
  construction: ["construction", "renovation", "expansion", "contractor"],
  shura: ["board", "shura", "governance", "bylaws"],
};

/**
 * Things the portal handles directly rather than one team: searching
 * "reimbursement" should say to send a payment request, not list a team.
 */
export const TOPICS: { words: string[]; text: string; href: string; label: string }[] = [
  {
    words: ["reimbursement", "reimburse", "reimbursements", "receipt", "receipts", "pay a vendor", "invoice", "check", "credit card", "purchase", "buy"],
    text: "The finance office handles payments and reimbursements. Send a payment request and it goes to the right people.",
    href: "/purchases/new",
    label: "Payment request",
  },
  {
    words: ["room", "book a room", "reserve", "reservation", "gym", "hall", "event"],
    text: "To book a room or hold an event, send an event request. The rooms are checked against the IAR calendar as you fill it in.",
    href: "/events/new",
    label: "Event request",
  },
  {
    words: ["broken", "repair", "wifi", "sound system", "projector", "leak", "lights"],
    text: "For anything broken or needed in the building, IT or A/V, send an AV/IT/Maintenance request and follow it until it's fixed.",
    href: "/it-maintenance/new",
    label: "AV/IT/Maintenance",
  },
];

const norm = (s: string) => ` ${s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'/]+/g, " ").trim()} `;
const STOP = new Set(["who", "handles", "handle", "do", "i", "ask", "about", "the", "a", "an", "for", "to", "with", "my", "our", "is", "of", "and", "or", "in", "on", "can", "how", "where", "get", "need", "help", "someone", "anyone", "team", "committee"]);

/** The search's meaningful words: lowercased, without filler like "who handles". */
export function queryWords(q: string): string[] {
  return norm(q).trim().split(" ").filter((w) => w && !STOP.has(w));
}

const has = (hay: string, phrase: string) => norm(hay).includes(norm(phrase));

/**
 * Teams matching a search, best first. A phrase from the keyword list scores
 * highest, then words in the team's name, then words in its description.
 */
export function searchTeams(teams: TeamEntry[], q: string): TeamEntry[] {
  const query = norm(q);
  const words = queryWords(q);
  if (!words.length) return [];
  const scored = teams.map((t) => {
    let score = 0;
    for (const k of TEAM_KEYWORDS[t.slug] ?? []) if (query.includes(norm(k))) score += 3;
    for (const w of words) {
      if (has(t.name, w)) score += 4;
      if (t.description && has(t.description, w)) score += 2;
    }
    return { t, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name))
    .map((s) => s.t);
}

/** Portal pages that answer a search better than any team ("reimbursement" → a payment request). */
export function searchTopics(q: string): typeof TOPICS {
  const query = norm(q);
  if (!queryWords(q).length) return [];
  return TOPICS.filter((t) => t.words.some((w) => query.includes(norm(w))));
}

/** A team's description and Chat link, checked before saving. Only Google Chat links are kept. */
export function checkTeamInfo(raw: { description?: string; chatUrl?: string }): { ok: true; info: TeamInfo } | { ok: false; error: string } {
  const description = (raw.description ?? "").replace(/\s+/g, " ").trim();
  if (description.length > 300) return { ok: false, error: "Keep what the team handles to 300 characters or fewer." };
  const chatUrl = (raw.chatUrl ?? "").trim();
  if (chatUrl && !/^https:\/\/(chat\.google\.com|mail\.google\.com\/chat)\/\S+$/.test(chatUrl)) return { ok: false, error: "The Chat link must be a Google Chat space link (https://chat.google.com/…)." };
  return { ok: true, info: { ...(description ? { description } : {}), ...(chatUrl ? { chatUrl } : {}) } };
}
