import { ORG } from "./org";
import { type Directory, type DirectoryGroup, type GroupMember, type TeamRole, PILLAR_PREFIX, slugOf, teamGroupEmail } from "./teams";

/**
 * Local development without Google: sample people with different groups.
 * Never active on Cloud Run (K_SERVICE is always set there).
 */
export function isDevAuth(): boolean {
  return process.env.DEV_AUTH === "1" && !process.env.K_SERVICE;
}

/** Sample users' email domain, standing in for the org's domain in dev mode. */
export const DEV_DOMAIN = "dev.local";

export type DevPersona = {
  id: string;
  name: string;
  email: string;
  title: string;
  /** Role groups (portal-role-*). */
  groups: string[];
  /** Team memberships, as they'd be set in each team's Google Group. */
  teams?: Record<string, TeamRole>;
};

const g = ORG.roleGroups as Record<"office" | "finance" | "executive" | "admins", string>;
const chairOf = (names: string[]) => Object.fromEntries(names.map((n) => [n, "chair" as const]));
const viceOf = (names: string[]) => Object.fromEntries(names.map((n) => [n, "vice" as const]));
const SAMPLE_CHAIRED = ["Youth", "Cleaning", "Events Committee", "Facility Maintenance", "Administration", "Imam Office"];

export const DEV_PERSONAS: DevPersona[] = [
  { id: "member", name: "Sample Volunteer", email: "volunteer@dev.local", title: "Member of Youth and Education", groups: [], teams: { Youth: "member", Education: "member" } },
  { id: "chair", name: "Sample Chair", email: "chair@dev.local", title: "Chairs Youth and other committees; member of Education", groups: [], teams: { ...chairOf(SAMPLE_CHAIRED), Education: "member", "Social & Welfare": "vice" } },
  { id: "vice", name: "Sample Vice Chair", email: "vice@dev.local", title: "Vice chair of Youth and other committees", groups: [], teams: viceOf(SAMPLE_CHAIRED) },
  { id: "office", name: "Sample Office", email: "office@dev.local", title: "IAR office", groups: [g.office], teams: { Administration: "member" } },
  { id: "finance", name: "Sample Finance", email: "finance@dev.local", title: "Finance, cardholder", groups: [g.finance], teams: { Administration: "member" } },
  { id: "sw", name: "Sample S&W Chair", email: "sw@dev.local", title: "Social & Welfare chair", groups: [], teams: { "Social & Welfare": "chair" } },
  { id: "director", name: "Sample Director", email: "director@dev.local", title: "Directs the Programs pillar: Youth, Women, Sports, Older Adults, Volunteer", groups: [] },
  { id: "executive", name: "Sample Executive", email: "exec@dev.local", title: "Executive (Head Imam, Shura chair or CEO)", groups: [g.executive], teams: { "Imam Office": "member" } },
  { id: "shura", name: "Sample Shura Member", email: "shura@dev.local", title: "Shura / board member", groups: [], teams: { Shura: "member" } },
  { id: "security", name: "Sample Security", email: "security@dev.local", title: "Safety & Security and Facility Maintenance", groups: [], teams: { "Safety & Security": "member", "Facility Maintenance": "member" } },
  { id: "admin", name: "Sample Admin", email: "admin@dev.local", title: "Portal admin", groups: [g.admins], teams: { Administration: "member" } },
];

/** Sample teams: the committees and teams IAR plans to create as Google Groups. In production the list comes from Google. */
const DEV_TEAMS = [
  "Administration", "Al-Furqan School", "Al-Iman School", "An-Noor School", "Cemetery", "Cleaning", "Construction", "Da'wah", "Education",
  "Events Committee", "Facility Maintenance", "Fundraising", "Health & Wellness", "IAR Cafe", "Imam Office", "IT Services", "Marketing",
  "Older Adult Community", "Outreach", "Page Road", "Safety & Security", "Shura", "Social & Welfare", "Sports & Recreation", "Volunteer",
  "Women's Committee", "Youth",
];
const DEV_PILLARS = [{ name: "Programs", owner: "director@dev.local", teams: ["Youth", "Women's Committee", "Sports & Recreation", "Older Adult Community", "Volunteer"] }];

const ROLE: Record<TeamRole, GroupMember["role"]> = { chair: "OWNER", vice: "MANAGER", member: "MEMBER" };

/** The sample people's teams and pillars, shaped like what Google returns. */
export function devDirectory(): Directory {
  const teams: DirectoryGroup[] = DEV_TEAMS.map((name) => ({
    email: teamGroupEmail(name, ORG.domain),
    name,
    members: DEV_PERSONAS.filter((p) => p.teams?.[name]).map((p) => ({ email: p.email, role: ROLE[p.teams![name]], type: "USER" as const })),
  }));
  const pillars: DirectoryGroup[] = DEV_PILLARS.map((p) => ({
    email: `${PILLAR_PREFIX}${slugOf(p.name)}@${ORG.domain}`,
    name: p.name,
    members: [{ email: p.owner, role: "OWNER" as const, type: "USER" as const }, ...p.teams.map((t) => ({ email: teamGroupEmail(t, ORG.domain), role: "MEMBER" as const, type: "GROUP" as const }))],
  }));
  return { teams, pillars };
}
