import "server-only";
import { directory } from "../groups";
import type { Viewer } from "../viewer";
import type { TicketTeam } from "./types";
import { type TicketActor, leadsOf, teamMemberEmails } from "./workflow";

/**
 * The person acting on tickets: their own group roles (never the admin
 * expansion) and the teams they chair or vice-chair.
 */
export function ticketActor(viewer: Viewer): TicketActor {
  return { email: viewer.email.toLowerCase(), name: viewer.name, roles: viewer.actingRoles, leads: leadsOf(viewer.teams) };
}

/** Each team's Google Group members: who tickets can be assigned to. */
export async function teamMembers(): Promise<Record<TicketTeam, string[]>> {
  const dir = await directory();
  return { it: teamMemberEmails(dir, "it"), facilities: teamMemberEmails(dir, "facilities") };
}
