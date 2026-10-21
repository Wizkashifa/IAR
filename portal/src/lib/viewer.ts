import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { DEV_PERSONAS, isDevAuth } from "./dev";
import { directRolesFromGroups, mayUsePortal, rolesFromGroups, type Role } from "./org";

/**
 * `roles` decide what someone can see; `actingRoles` (from their own groups,
 * without the admin expansion) decide what they can approve or pay.
 */
export type Viewer = { email: string; name: string; roles: Role[]; actingRoles: Role[]; dev: boolean };

export async function getViewer(): Promise<Viewer | null> {
  if (isDevAuth()) {
    const id = (await cookies()).get("dev_persona")?.value;
    const p = DEV_PERSONAS.find((x) => x.id === id) ?? DEV_PERSONAS[0];
    return { email: p.email, name: p.name, roles: rolesFromGroups(p.groups), actingRoles: directRolesFromGroups(p.groups), dev: true };
  }
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;
  const groups = (session as { groups?: string[] }).groups ?? [];
  // Removed from the beta group: groups refresh every 15 minutes, then access stops.
  if (!mayUsePortal(groups)) return null;
  return { email, name: session.user?.name ?? email, roles: rolesFromGroups(groups), actingRoles: directRolesFromGroups(groups), dev: false };
}

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/signin");
  return v;
}
