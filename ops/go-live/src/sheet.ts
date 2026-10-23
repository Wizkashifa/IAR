/**
 * The members Sheet: the one-time starting list of who goes in which Google
 * Group, plus each team's fund, IAR's cards, the testers and the room list.
 * The office fills it in; go-live reads it once, then it's archived and
 * Google Groups is the record from then on. Plain functions so they can be
 * tested. The template holds no people, only the groups and rooms.
 */
import { FUNDS } from "../../../portal/src/lib/purchases/accounts";
import { suggestFund } from "../../../portal/src/lib/teams";
import { LAUNCH_ROOMS, LAUNCH_TEAMS, ROLE_GROUPS, TEAM_ALIASES, pillarGroup, roleGroup, teamGroup } from "./launch";

export type Tab = {
  name: string;
  header: string[];
  rows: string[][];
  /** Column index → allowed values (a dropdown). */
  lists?: Record<number, string[]>;
  /** Column widths, in characters. */
  widths?: number[];
  hidden?: boolean;
};

export const GROUP_ROLES = ["Owner", "Manager", "Member"];
const YES_NO = ["Yes", "No"];

export const TAB = { readMe: "Read me", groups: "Groups", pillars: "Pillars", funds: "Funds", cards: "Cards", testers: "Testers", rooms: "Rooms" } as const;

/** The blank Sheet, ready for the office. */
export function templateTabs(domain: string): Tab[] {
  const readMe: Tab = {
    name: TAB.readMe,
    header: ["How to fill this in"],
    widths: [110],
    rows: [
      ["This Sheet sets up who can do what in the IAR Portal. It's used once, at launch. After that, Google Groups is the record, and changes are made there."],
      [""],
      ["Groups: add one row per person per committee or team. Role: Owner = chair (co-chairs are both Owners), Manager = vice chair, Member = member."],
      ["   A person can be on several committees, with a different role in each. Insert rows under a committee as needed; keep the committee name on every row."],
      ["   The role groups at the bottom (office, finance, executive, admins) take Members only."],
      ["Pillars: one row per director's pillar: its name, the director's email (two for co-directors, separated by commas), and the committees it covers."],
      ["Funds: the fund each committee charges. A suggestion is filled in where the names match; change it if it's wrong, or leave it blank for finance."],
      ["Cards: IAR credit cards. Last 4 digits ONLY, never the full number."],
      ["Testers: 5–10 people who try the portal first: at least one chair, one director, one executive, one finance person and one regular requester."],
      ["Rooms: check the room list against IAR's room calendars. Mark each room bookable or not and add anything missing."],
      [""],
      [`Use @${domain} addresses only. If you're not sure of someone's address, highlight the row and it will be checked.`],
    ],
  };
  const groups: Tab = {
    name: TAB.groups,
    header: ["Committee or group", "Group address", "Email", "Role", "Notes"],
    widths: [30, 44, 36, 12, 40],
    lists: { 3: GROUP_ROLES },
    rows: [
      ...LAUNCH_TEAMS.map((t) => [t, teamGroup(t, domain), "", "", ""]),
      ...ROLE_GROUPS.filter((g) => g.key !== "beta").map((g) => [g.name, roleGroup(g, domain), "", "Member", g.what]),
    ],
  };
  const pillars: Tab = {
    name: TAB.pillars,
    header: ["Pillar name", "Director email(s)", "Committees it covers (comma-separated, as named on the Groups tab)"],
    widths: [24, 44, 90],
    rows: [["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""]],
  };
  const funds: Tab = {
    name: TAB.funds,
    header: ["Committee", "Fund it charges"],
    widths: [30, 44],
    lists: { 1: FUNDS },
    rows: LAUNCH_TEAMS.map((t) => [t, suggestFund(t, FUNDS) ?? ""]),
  };
  const cards: Tab = {
    name: TAB.cards,
    header: ["Last 4 digits", "Cardholder's name", "Cardholder's email", "Fund"],
    widths: [14, 28, 36, 44],
    lists: { 3: FUNDS },
    rows: [["", "", "", ""], ["", "", "", ""], ["", "", "", ""]],
  };
  const testers: Tab = {
    name: TAB.testers,
    header: ["Email", "Name", "What they'll test (chair, director, executive, finance, requester…)"],
    widths: [36, 28, 60],
    rows: Array.from({ length: 10 }, () => ["", "", ""]),
  };
  const rooms: Tab = {
    name: TAB.rooms,
    header: ["Room", "Building", "Capacity", "Bookable in the portal", "Food allowed", "Notes"],
    widths: [36, 16, 10, 22, 14, 60],
    lists: { 3: YES_NO, 4: YES_NO },
    rows: LAUNCH_ROOMS.map((r) => [r.name, r.building, String(r.capacity), "", r.food ? "Yes" : "No", r.notes ?? ""]),
  };
  return [readMe, groups, pillars, funds, cards, testers, rooms];
}

// ---- Reading it back ---------------------------------------------------

export type MemberRow = { group: string; groupName: string; email: string; role: "OWNER" | "MANAGER" | "MEMBER" };
export type PillarRow = { name: string; group: string; directors: string[]; teams: string[] };
export type CardRow = { last4: string; holderName: string; holderEmail: string; fund: string };
export type RoomRow = { name: string; building: string; capacity: number; bookable: boolean | null; food: boolean; notes: string };

export type MembersPlan = {
  members: MemberRow[];
  pillars: PillarRow[];
  /** Team group → fund. */
  funds: Record<string, string>;
  cards: CardRow[];
  testers: string[];
  rooms: RoomRow[];
};

const EMAIL = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+$/;
const cell = (row: string[] | undefined, i: number) => String(row?.[i] ?? "").trim();
const body = (tab: string[][] | undefined) => (tab ?? []).slice(1).filter((r) => r.some((c) => String(c ?? "").trim()));

/**
 * Check the filled-in Sheet. Every problem is listed with its tab and row, so
 * the office can fix them all at once; go-live stops if there are any.
 */
export function parseSheet(tabs: Record<string, string[][]>, domain: string): { ok: true; plan: MembersPlan } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const at = (tab: string, i: number) => `${tab}, row ${i + 2}`;
  const inDomain = (e: string) => EMAIL.test(e) && e.endsWith(`@${domain}`);
  const teamByName = new Map(LAUNCH_TEAMS.map((t) => [t.toLowerCase(), t]));
  // Names from older copies of the template that now go to another team.
  for (const [old, now] of Object.entries(TEAM_ALIASES)) teamByName.set(old.toLowerCase(), now);
  const roleByName = new Map(ROLE_GROUPS.map((g) => [g.name.toLowerCase(), g]));

  const members: MemberRow[] = [];
  const seen = new Set<string>();
  body(tabs[TAB.groups]).forEach((r, i) => {
    const name = cell(r, 0);
    const email = cell(r, 2).toLowerCase();
    const role = cell(r, 3) || "Member";
    if (!email) return;
    const team = teamByName.get(name.toLowerCase());
    const rg = roleByName.get(name.toLowerCase());
    if (!team && !rg) return void errors.push(`${at(TAB.groups, i)}: "${name}" isn't one of the committees or groups listed. Keep the name exactly as it was.`);
    if (!inDomain(email)) return void errors.push(`${at(TAB.groups, i)}: "${email}" isn't an @${domain} address.`);
    if (!GROUP_ROLES.includes(role)) return void errors.push(`${at(TAB.groups, i)}: role must be Owner, Manager or Member.`);
    if (rg && role !== "Member") return void errors.push(`${at(TAB.groups, i)}: ${rg.name} takes Members only.`);
    const group = team ? teamGroup(team, domain) : roleGroup(rg!, domain);
    const key = `${group}|${email}`;
    if (seen.has(key)) return void errors.push(`${at(TAB.groups, i)}: ${email} is listed twice for ${name}. Keep one row with their role.`);
    seen.add(key);
    members.push({ group, groupName: team ?? rg!.name, email, role: role.toUpperCase() as MemberRow["role"] });
  });

  const pillars: PillarRow[] = [];
  body(tabs[TAB.pillars]).forEach((r, i) => {
    const name = cell(r, 0);
    const directors = cell(r, 1).split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    const teamNames = cell(r, 2).split(/[,;]+/).map((t) => t.trim()).filter(Boolean);
    if (!name) return void errors.push(`${at(TAB.pillars, i)}: give the pillar a name.`);
    const bad = directors.filter((d) => !inDomain(d));
    if (!directors.length) errors.push(`${at(TAB.pillars, i)}: add the director's email.`);
    if (bad.length) errors.push(`${at(TAB.pillars, i)}: ${bad.join(", ")} isn't an @${domain} address.`);
    const unknown = teamNames.filter((t) => !teamByName.has(t.toLowerCase()));
    if (unknown.length) errors.push(`${at(TAB.pillars, i)}: ${unknown.map((t) => `"${t}"`).join(", ")} isn't on the Groups tab.`);
    pillars.push({ name, group: pillarGroup(name, domain), directors, teams: teamNames.filter((t) => teamByName.has(t.toLowerCase())).map((t) => teamGroup(teamByName.get(t.toLowerCase())!, domain)) });
  });
  const inTwo = new Map<string, string>();
  for (const p of pillars) for (const t of p.teams) {
    if (inTwo.has(t)) errors.push(`Pillars: ${t} is under both ${inTwo.get(t)} and ${p.name}. A committee has one director's pillar.`);
    inTwo.set(t, p.name);
  }

  const funds: Record<string, string> = {};
  body(tabs[TAB.funds]).forEach((r, i) => {
    const team = teamByName.get(cell(r, 0).toLowerCase());
    const fund = cell(r, 1);
    if (!team || !fund) return;
    if (!FUNDS.includes(fund)) return void errors.push(`${at(TAB.funds, i)}: "${fund}" isn't a fund in the chart of accounts. Pick one from the list.`);
    funds[teamGroup(team, domain)] = fund;
  });

  const cards: CardRow[] = [];
  body(tabs[TAB.cards]).forEach((r, i) => {
    const last4 = cell(r, 0), holderName = cell(r, 1), holderEmail = cell(r, 2).toLowerCase(), fund = cell(r, 3);
    if (!/^\d{4}$/.test(last4)) return void errors.push(`${at(TAB.cards, i)}: enter only the card's last 4 digits.`);
    if (cards.some((c) => c.last4 === last4)) return void errors.push(`${at(TAB.cards, i)}: a card ending ${last4} is listed twice.`);
    if (!holderName) errors.push(`${at(TAB.cards, i)}: add the cardholder's name.`);
    if (!inDomain(holderEmail)) errors.push(`${at(TAB.cards, i)}: the cardholder needs an @${domain} address.`);
    if (!FUNDS.includes(fund)) errors.push(`${at(TAB.cards, i)}: pick the card's fund from the list.`);
    cards.push({ last4, holderName, holderEmail, fund });
  });

  const testers: string[] = [];
  body(tabs[TAB.testers]).forEach((r, i) => {
    const e = cell(r, 0).toLowerCase();
    if (!e) return;
    if (!inDomain(e)) return void errors.push(`${at(TAB.testers, i)}: "${e}" isn't an @${domain} address.`);
    if (!testers.includes(e)) testers.push(e);
  });

  const yes = (s: string) => (/^y/i.test(s) ? true : /^n/i.test(s) ? false : null);
  const rooms: RoomRow[] = body(tabs[TAB.rooms]).map((r) => ({
    name: cell(r, 0),
    building: cell(r, 1),
    capacity: Number(cell(r, 2)) || 0,
    bookable: yes(cell(r, 3)),
    food: yes(cell(r, 4)) === true,
    notes: cell(r, 5),
  }));

  if (errors.length) return { ok: false, errors };
  return { ok: true, plan: { members, pillars, funds, cards, testers, rooms } };
}
