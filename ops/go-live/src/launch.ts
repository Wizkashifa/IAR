/**
 * What go-live sets up the first time: the committees and teams to create as
 * Google Groups, the role groups, and the room list for the office to check.
 * No people: who goes in each group comes from the members Sheet, which the
 * office fills in and which never enters this public repo.
 */
import { slugOf, teamGroupEmail, PILLAR_PREFIX, ROLE_PREFIX } from "../../../portal/src/lib/teams";

/** The launch list (docs/setup.md §6). Display names are exactly what the portal shows; addresses come from TEAM_SLUGS in teams.ts. Outreach is part of Da'wah. */
export const LAUNCH_TEAMS = [
  "Administration", "Al-Furqan School", "Al-Iman School", "An-Noor School", "Cemetery", "Cleaning", "Construction", "Da'wah", "Education",
  "Events Committee", "Facility Maintenance", "Fundraising", "Health & Wellness", "IAR Cafe", "Imam Office", "IT Services", "Marketing",
  "Older Adult Community", "Page Road", "Safety & Security", "Shura", "Social & Welfare", "Sports & Recreation", "Volunteer",
  "Women's Committee", "Youth",
];

/** Teams merged into another: rows for them in an older Sheet count for the team they joined. */
export const TEAM_ALIASES: Record<string, string> = { Outreach: "Da'wah" };

export type RoleGroup = { key: string; name: string; local: string; what: string };

/** Portal-wide jobs. Members only. */
export const ROLE_GROUPS: RoleGroup[] = [
  { key: "office", name: "Portal: IAR office", local: `${ROLE_PREFIX}office`, what: "The IAR office: rentals, run sheet; can submit for any committee" },
  { key: "finance", name: "Portal: Finance", local: `${ROLE_PREFIX}finance`, what: "Finance review, payment, QuickBooks entry, restricted S&W requests" },
  { key: "executive", name: "Portal: Executive", local: `${ROLE_PREFIX}executive`, what: "Whoever holds an executive office (Head Imam, Shura chair, CEO): final mission review of events, executive approvals" },
  { key: "admins", name: "Portal: Admins", local: `${ROLE_PREFIX}admin`, what: "Two or three people who support the portal. Never approve or pay" },
  { key: "beta", name: "Portal: Beta testers", local: `${ROLE_PREFIX}beta`, what: "During the beta, only this group and the admins can sign in" },
];

export const teamGroup = (name: string, domain: string) => teamGroupEmail(name, domain);
export const pillarGroup = (name: string, domain: string) => `${PILLAR_PREFIX}${slugOf(name)}@${domain}`;
export const roleGroup = (g: RoleGroup, domain: string) => `${g.local}@${domain}`;

export type LaunchRoom = { name: string; building: string; capacity: number; food?: boolean; notes?: string };

/**
 * The rooms on today's Program Request Form, as a starting list. The office
 * checks it against IAR's room resources in Google (Admin console → Buildings
 * and resources), which stay the record of what rooms exist.
 */
export const LAUNCH_ROOMS: LaunchRoom[] = [
  { name: "MPH A – half gym", building: "Main campus", capacity: 75, food: true },
  { name: "MPH B – half gym", building: "Main campus", capacity: 75, food: true },
  { name: "MPH A&B – full gym", building: "Main campus", capacity: 150, food: true, notes: "Overlaps MPH A and MPH B" },
  { name: "Al-Maidah Cafe", building: "Main campus", capacity: 50, food: true, notes: "$100/hour minimum food and drink purchase" },
  { name: "Main Prayer Hall", building: "Main campus", capacity: 300 },
  { name: "Room behind Main Prayer Hall", building: "Main campus", capacity: 50 },
  { name: "Room 220 – children's play room", building: "Main campus", capacity: 20 },
  { name: "Room 230A – glass room", building: "Main campus", capacity: 20 },
  { name: "Room 230B – glass room", building: "Main campus", capacity: 20 },
  { name: "Room 240 – conference room", building: "Main campus", capacity: 30, food: true, notes: "Leadership, imams and chairs only" },
  { name: "Room 250 – An Noor meeting room", building: "Main campus", capacity: 20 },
  { name: "Room 280 – EC meeting room", building: "Main campus", capacity: 20 },
  { name: "Women's Prayer Hall", building: "Main campus", capacity: 100, notes: "Bookable? Not in the 2021 policy" },
  { name: "3rd floor – Arabic Islamic Studies", building: "Main campus", capacity: 20 },
  { name: "3rd floor – Language Arts", building: "Main campus", capacity: 20 },
  { name: "3rd floor – Math classroom", building: "Main campus", capacity: 20 },
  { name: "Red Brick – Arabic Islamic Studies", building: "Main campus", capacity: 30, notes: "Bookable? Not in the 2021 policy. Food pantry on 1st Saturdays" },
  { name: "Red Brick – Grade 1 room", building: "Main campus", capacity: 30, notes: "Bookable? Not in the 2021 policy. Food pantry on 1st Saturdays" },
  { name: "Community Flex Room", building: "Main campus", capacity: 40, notes: "Bookable? Not in the 2021 policy" },
  { name: "Fire Pit Area", building: "Main campus", capacity: 40, notes: "Open fires are banned by the policy; waiting on a Shura decision" },
];
