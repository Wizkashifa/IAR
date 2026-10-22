import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { DEV_PERSONAS, isDevAuth } from "./dev";
import { directory } from "./groups";
import { directRolesFromGroups, mayUsePortal, rolesFromGroups, type Role } from "./org";
import { portalSettings } from "./portal-settings";
import { type Membership, directedTeamGroups, membershipsOf, teamRoles } from "./teams";

/**
 * `roles` decide what someone can see; `actingRoles` (from their own groups
 * and teams, without the admin expansion) decide what they can approve or pay.
 * `teams` are the committees and teams they're on, with their role in each;
 * `directs` are the team groups of the pillars they direct.
 */
export type Viewer = { email: string; name: string; roles: Role[]; actingRoles: Role[]; teams: Membership[]; directs: string[]; dev: boolean };

async function build(email: string, name: string, groups: string[], dev: boolean): Promise<Viewer> {
  const [dir, settings] = await Promise.all([directory(), portalSettings()]);
  const teams = membershipsOf(dir, email);
  const fromTeams: Role[] = [...teamRoles(teams)];
  if (settings.cards.some((c) => c.holderEmail === email.toLowerCase())) fromTeams.push("cardholders");
  return { email, name, roles: rolesFromGroups(groups, fromTeams), actingRoles: directRolesFromGroups(groups, fromTeams), teams, directs: directedTeamGroups(dir, email), dev };
}

export async function getViewer(): Promise<Viewer | null> {
  if (isDevAuth()) {
    const id = (await cookies()).get("dev_persona")?.value;
    const p = DEV_PERSONAS.find((x) => x.id === id) ?? DEV_PERSONAS[0];
    return build(p.email, p.name, p.groups, true);
  }
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;
  const groups = (session as { groups?: string[] }).groups ?? [];
  // Removed from the beta group: groups refresh every 15 minutes, then access stops.
  if (!mayUsePortal(groups)) return null;
  return build(email.toLowerCase(), session.user?.name ?? email, groups, false);
}

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/signin");
  return v;
}
