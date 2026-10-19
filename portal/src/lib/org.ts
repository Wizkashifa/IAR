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
  /** Google Group that grants each role. "member" needs no group. */
  roleGroups: {
    chairs: `portal-committee-chairs@${domain}`,
    office: `portal-office@${domain}`,
    finance: `portal-finance@${domain}`,
    cardholders: `portal-cardholders@${domain}`,
    marketing: `portal-marketing@${domain}`,
    av: `portal-av@${domain}`,
    facilities: `portal-facilities@${domain}`,
    security: `portal-security@${domain}`,
    sw: `portal-sw@${domain}`,
    executive: `portal-executive@${domain}`,
    /** Majlis ash-Shura and board members: dashboard and budget, read-only, plus requests to finance and the executive. */
    shura: `portal-shura@${domain}`,
    admins: `portal-admins@${domain}`,
  } satisfies Record<Exclude<Role, "member">, string>,
};

/**
 * The roles a user's own Google Groups grant, with no admin expansion. Use
 * these to decide who may act (approve, pay): a portal admin is a support
 * role and does not approve or pay anything unless also in that group.
 */
export function directRolesFromGroups(groupEmails: string[]): Role[] {
  const held = new Set(groupEmails.map((g) => g.toLowerCase()));
  const roles: Role[] = ["member"];
  for (const [role, group] of Object.entries(ORG.roleGroups)) {
    if (held.has(group.toLowerCase())) roles.push(role as Role);
  }
  return roles;
}

/** Turn a user's Google Group emails into portal roles, for what they can see. */
export function rolesFromGroups(groupEmails: string[]): Role[] {
  const roles = directRolesFromGroups(groupEmails);
  // Admins can see every module, for support and setup.
  if (roles.includes("admins")) return [...ROLES];
  return roles;
}
