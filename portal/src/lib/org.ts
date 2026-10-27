/**
 * Organization settings. Everything a second masjid would change lives here
 * (later: in the database, edited from an admin screen).
 */

/** Logical roles. Every signed-in domain user is a "member". */
export const ROLES = [
  "member",
  "chairs",
  "office",
  "finance",
  "cardholders",
  "marketing",
  "av",
  "it",
  "facilities",
  "security",
  "sw",
  "executive",
  "shura",
  "admins",
] as const;
export type Role = (typeof ROLES)[number];

const domain = (process.env.ORG_DOMAIN ?? "islam1.org").toLowerCase();

export const ORG = {
  id: "iar",
  name: "Islamic Association of Raleigh",
  shortName: "IAR",
  domain,
  /**
   * Role groups (portal-role-<job>@): portal-wide jobs, members only. The
   * other roles come from a person's teams (see teams.ts): a team's queue
   * role from being on that team, "chairs" from owning any team group, and
   * "cardholders" from the card list in Portal Settings.
   */
  roleGroups: {
    office: `portal-role-office@${domain}`,
    finance: `portal-role-finance@${domain}`,
    /** Whoever holds an executive office (Head Imam, Shura chair, CEO; one person can hold several): final mission review of events, and executive approvals. */
    executive: `portal-role-executive@${domain}`,
    admins: `portal-role-admin@${domain}`,
  } as Partial<Record<Role, string>>,
  /**
   * The testers ("Portal: Testers"). They use what's still a demo (purchase requests) for real. The address
   * keeps its first name, portal-role-beta@, so settings that point to it keep working.
   */
  testersGroup: `portal-role-beta@${domain}`,
};

/** Where email for a role's queue goes: its role group, or the team group that grants it. */
export function roleMailbox(role: Role): string | null {
  const g = ORG.roleGroups[role];
  if (g) return g;
  const team: Partial<Record<Role, string>> = { marketing: "marketing", av: "tech", it: "tech", facilities: "maintenance", security: "security", sw: "welfare", shura: "shura" };
  return team[role] ? `portal-team-${team[role]}@${domain}` : null;
}

/**
 * The roles a user's own Google Groups grant, with no admin expansion. Use
 * these to decide who may act (approve, pay): a portal admin is a support
 * role and does not approve or pay anything unless also in that group.
 */
export function directRolesFromGroups(groupEmails: string[], fromTeams: Role[] = []): Role[] {
  const held = new Set(groupEmails.map((g) => g.toLowerCase()));
  const roles = new Set<Role>(["member"]);
  for (const [role, group] of Object.entries(ORG.roleGroups)) {
    if (group && held.has(group.toLowerCase())) roles.add(role as Role);
  }
  for (const r of fromTeams) roles.add(r);
  return ROLES.filter((r) => roles.has(r));
}

/** Turn a user's Google Group emails into portal roles, for what they can see. */
/**
 * While PORTAL_ACCESS_GROUP is set (go-live sets it until the portal opens to
 * everyone), only that group's members and portal admins can sign in. Unset: every
 * @domain account can. Add testers to the group directly; nested groups
 * aren't checked.
 */
export function mayUsePortal(groupEmails: string[]): boolean {
  const gate = process.env.PORTAL_ACCESS_GROUP?.trim().toLowerCase();
  if (!gate) return true;
  const held = new Set(groupEmails.map((g) => g.toLowerCase()));
  return held.has(gate) || held.has(String(ORG.roleGroups.admins).toLowerCase());
}

export function rolesFromGroups(groupEmails: string[], fromTeams: Role[] = []): Role[] {
  const roles = directRolesFromGroups(groupEmails, fromTeams);
  // Admins can see every module, for support and setup.
  if (roles.includes("admins")) return [...ROLES];
  return roles;
}
