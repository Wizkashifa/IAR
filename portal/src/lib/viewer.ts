import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ACT_AS_COOKIE, type ActAs, readActAs } from "./act-as";
import { audit } from "./audit";
import { authOptions } from "./auth";
import { DEV_PERSONAS, isDevAuth } from "./dev";
import { directory, lookupGroups } from "./groups";
import { directRolesFromGroups, mayUsePortal, rolesFromGroups, type Role } from "./org";
import { portalSettings } from "./portal-settings";
import { type Membership, directedTeamGroups, membershipsOf, teamRoles } from "./teams";

/**
 * `roles` decide what someone can see; `actingRoles` (from their own groups
 * and teams, without the admin expansion) decide what they can approve or pay.
 * `teams` are the committees and teams they're on, with their role in each;
 * `directs` are the team groups of the pillars they direct. `supportAdmin` is
 * set when a portal admin is signed in as this person to troubleshoot: the
 * portal is theirs, and what's saved says the admin did it (lib/act-as.ts).
 */
export type Viewer = { email: string; name: string; roles: Role[]; actingRoles: Role[]; teams: Membership[]; directs: string[]; dev: boolean; supportAdmin?: { email: string; name: string } };

async function build(email: string, name: string, groups: string[], dev: boolean): Promise<Viewer> {
  const [dir, settings] = await Promise.all([directory(), portalSettings()]);
  const teams = membershipsOf(dir, email);
  const fromTeams: Role[] = [...teamRoles(teams)];
  if (settings.cards.some((c) => c.holderEmail === email.toLowerCase())) fromTeams.push("cardholders");
  return { email, name, roles: rolesFromGroups(groups, fromTeams), actingRoles: directRolesFromGroups(groups, fromTeams), teams, directs: directedTeamGroups(dir, email), dev };
}

// The groups of someone an admin is signed in as (they have no session of their own to carry them), for 15 minutes.
const targetGroups = new Map<string, { at: number; groups: string[] }>();
async function groupsOf(email: string): Promise<string[]> {
  const hit = targetGroups.get(email);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.groups;
  const groups = await lookupGroups(email);
  targetGroups.set(email, { at: Date.now(), groups });
  return groups;
}

type Signed = { email: string; name: string; groups: string[] };

/** The person really signed in with Google, once per request. */
const signedIn = cache(async (): Promise<Signed | null> => {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;
  return { email: email.toLowerCase(), name: session.user?.name ?? email, groups: (session as { groups?: string[] }).groups ?? [] };
});

/**
 * Whether a portal admin is signed in as someone else for this request.
 * Checked on every request: an admin removed from portal-role-admin@ is back
 * to themselves at once. Never in dev mode, where /dev switches people.
 */
export const currentActAs = cache(async (): Promise<ActAs | null> => {
  if (isDevAuth()) return null;
  const me = await signedIn();
  if (!me || !mayUsePortal(me.groups) || !directRolesFromGroups(me.groups).includes("admins")) return null;
  return readActAs((await cookies()).get(ACT_AS_COOKIE)?.value, process.env.NEXTAUTH_SECRET ?? "", me.email);
});

/** Each form sent while signed in as someone goes in the audit log, once per request. */
const auditForm = cache(async (a: ActAs, page: string) => audit({ admin: a.admin, target: a.target, action: `Sent a form on ${page}` }));

/** Who is looking, built once per request however many places ask (the layout, the page, its actions). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (isDevAuth()) {
    const id = (await cookies()).get("dev_persona")?.value;
    const p = DEV_PERSONAS.find((x) => x.id === id) ?? DEV_PERSONAS[0];
    return build(p.email, p.name, p.groups, true);
  }
  const me = await signedIn();
  if (!me) return null;
  // Removed from the beta group: groups refresh every 15 minutes, then access stops.
  if (!mayUsePortal(me.groups)) return null;
  const as = await currentActAs();
  if (as) {
    try {
      const groups = await groupsOf(as.target);
      if (mayUsePortal(groups)) {
        const h = await headers();
        if (h.get("next-action")) await auditForm(as, new URL(h.get("referer") ?? "/", "http://x").pathname);
        return { ...(await build(as.target, as.targetName, groups, false)), supportAdmin: { email: me.email, name: as.adminName } };
      }
    } catch (err) {
      // Can't look them up: the admin stays themselves.
      console.error("sign in as: lookup failed", err);
    }
  }
  return build(me.email, me.name, me.groups, false);
});

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/signin");
  return v;
}
