/**
 * Step 5. Every portal Google Group, its settings, and its members from the
 * Sheet. Only adds (and sets roles) unless --sync, which lists people in the
 * groups who aren't on the Sheet and removes them after a separate yes.
 * Testers are never added here: that's step 13.
 */
import { LAUNCH_TEAMS, ROLE_GROUPS, roleGroup, teamGroup } from "../launch";
import type { Member } from "../google";
import { type Change, type Ctx, type Stage, Stop } from "../types";

export const POST_OK = ["ALL_IN_DOMAIN_CAN_POST", "ANYONE_CAN_POST"];
const OWNERS_ONLY = "OWNERS_ONLY";

type Want = { email: string; name: string; description: string; kind: "team" | "pillar" | "role"; members: Member[]; noMembers?: boolean };

export function wantedGroups(ctx: Ctx): Want[] {
  const d = ctx.opt.domain;
  const p = ctx.members;
  if (!p) throw new Stop("The members Sheet hasn't been read (step 1).");
  const of = (g: string) => p.members.filter((m) => m.group === g).map((m): Member => ({ email: m.email, role: m.role, type: "USER" }));
  return [
    ...LAUNCH_TEAMS.map((t): Want => ({ email: teamGroup(t, d), name: t, description: `${t}: Owner = chair, Manager = vice chair. Used by the IAR Portal.`, kind: "team", members: of(teamGroup(t, d)) })),
    ...p.pillars.map((pl): Want => ({
      email: pl.group,
      name: pl.name,
      description: `${pl.name} pillar: Owner = director; members are the committees it covers. Used by the IAR Portal.`,
      kind: "pillar",
      members: [...pl.directors.map((e): Member => ({ email: e, role: "OWNER", type: "USER" })), ...pl.teams.map((t): Member => ({ email: t, role: "MEMBER", type: "GROUP" }))],
    })),
    ...ROLE_GROUPS.map((r): Want => ({ email: roleGroup(r, d), name: r.name, description: `${r.what}. Used by the IAR Portal.`, kind: "role", members: of(roleGroup(r, d)), noMembers: r.key === "beta" })),
  ];
}

const settingsFor = (w: Want) => ({
  ...(w.kind !== "role" ? { whoCanModerateMembers: OWNERS_ONLY } : {}),
  ...(w.kind !== "pillar" ? { whoCanPostMessage: "ALL_IN_DOMAIN_CAN_POST" } : {}),
});
const settingsText = (w: Want) =>
  [w.kind !== "role" ? "only owners manage members" : "", w.kind !== "pillar" ? `anyone at ${w.email.split("@")[1]} (including portal@) can post` : ""].filter(Boolean).join("; ");
const ROLE_NAME = { OWNER: "Owner", MANAGER: "Manager", MEMBER: "Member" } as const;

export const groups: Stage = {
  id: "groups",
  title: "Google Groups: committees, pillars and roles",
  async plan(ctx) {
    const { g, state, opt } = ctx;
    const out: Change[] = [];
    const archived = Boolean(state.sheetArchivedAt);
    for (const w of wantedGroups(ctx)) {
      const existing = await g.getGroup(w.email);
      if (!existing)
        out.push({
          kind: "create",
          text: `Create ${w.email} "${w.name}"${settingsText(w) ? ` (${settingsText(w)})` : ""}`,
          run: async (c) => {
            await c.g.createGroup({ email: w.email, name: w.name, description: w.description });
            await c.g.updateGroupSettings(w.email, settingsFor(w));
          },
        });
      else {
        // Role groups keep go-live's names (a new name, like "Portal: Testers"); committees keep whatever the admins named them.
        if (w.kind === "role" && existing.name !== w.name)
          out.push({ kind: "update", text: `Rename ${w.email} from "${existing.name}" to "${w.name}" (its address stays)`, run: (c) => c.g.renameGroup(w.email, w.name, w.description) });
        const s = await g.getGroupSettings(w.email);
        const fix: Record<string, string> = {};
        if (w.kind !== "role" && s.whoCanModerateMembers !== OWNERS_ONLY) fix.whoCanModerateMembers = OWNERS_ONLY;
        if (w.kind !== "pillar" && !POST_OK.includes(s.whoCanPostMessage ?? "")) fix.whoCanPostMessage = "ALL_IN_DOMAIN_CAN_POST";
        if (Object.keys(fix).length) out.push({ kind: "update", text: `Settings of ${w.email}: ${settingsText(w)}`, run: (c) => c.g.updateGroupSettings(w.email, fix) });
      }
      if (w.noMembers || archived) continue;
      const have = existing ? await g.listMembers(w.email) : [];
      const byEmail = new Map(have.map((m) => [m.email.toLowerCase(), m]));
      for (const m of w.members) {
        const cur = byEmail.get(m.email);
        if (!cur) out.push({ kind: "create", text: `Add ${m.email} to ${w.email} as ${m.type === "GROUP" ? "a member group" : ROLE_NAME[m.role]}`, run: (c) => c.g.addMember(w.email, m) });
        else if (cur.role !== m.role) out.push({ kind: "update", text: `Make ${m.email} ${ROLE_NAME[m.role]} of ${w.email} (now ${ROLE_NAME[cur.role]})`, run: (c) => c.g.updateMemberRole(w.email, m.email, m.role) });
      }
      if (opt.sync) {
        const wanted = new Set(w.members.map((m) => m.email));
        for (const m of have)
          if (!wanted.has(m.email.toLowerCase()))
            out.push({ kind: "remove", text: `Remove ${m.email} from ${w.email} (not on the Sheet)`, ask: "remove", run: (c) => c.g.removeMember(w.email, m.email) });
      }
    }
    if (!archived && !out.some((c) => c.kind !== "check")) state.membersAddedAt ??= new Date().toISOString();
    if (archived) out.push({ kind: "check", text: "Members aren't added from the archived Sheet. Add or remove people in Admin console → Directory → Groups." });
    else if (opt.sync && !out.some((c) => c.kind === "remove")) out.push({ kind: "check", text: "--sync: everyone in the groups is on the Sheet" });
    return out;
  },
  async apply(ctx, changes) {
    for (const c of changes) await c.run?.(ctx);
    // Step 10 archives the Sheet only once everyone on it is in their groups.
    if (!ctx.state.sheetArchivedAt) ctx.state.membersAddedAt ??= new Date().toISOString();
  },
};
