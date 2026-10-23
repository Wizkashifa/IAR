/**
 * Step 10. Write the Sheet's team funds and cards, and step 6's Chat spaces,
 * into Portal Settings in Firestore (orgs/iar/settings/portal). Only adds:
 * anything already there (an admin's choice in Portal Settings) is kept, and
 * other fields are never touched. Then archive the Sheet: from now on, Google
 * Groups is the record of who does what.
 */
import { SETTINGS_DOC, SPACES } from "../config";
import { TAB, type CardRow } from "../sheet";
import { type Change, type Ctx, type Stage, Stop } from "../types";
import { portalBase } from "./chat";

type Card = { last4: string; holderEmail: string; holderName: string; fund: string };

/** What to write: the existing values win; the Sheet and step 6 only fill gaps. */
export function mergeSettings(existing: Record<string, unknown> | null, add: { teamFunds: Record<string, string>; cards: CardRow[]; chatSpaces: Record<string, string> }) {
  const cur = existing ?? {};
  const curFunds = (cur.teamFunds as Record<string, string> | undefined) ?? {};
  const curCards = (cur.cards as Card[] | undefined) ?? [];
  const curSpaces = (cur.chatSpaces as Record<string, string> | undefined) ?? {};
  const newFunds = Object.entries(add.teamFunds).filter(([k]) => !(k in curFunds));
  const newCards = add.cards.filter((c) => !curCards.some((x) => x.last4 === c.last4)).map((c): Card => ({ last4: c.last4, holderEmail: c.holderEmail, holderName: c.holderName, fund: c.fund }));
  const newSpaces = Object.entries(add.chatSpaces).filter(([k]) => !curSpaces[k]);
  const kept = Object.entries(add.teamFunds).filter(([k, v]) => k in curFunds && curFunds[k] !== v).map(([k]) => `${k}: kept "${curFunds[k]}" (the Sheet says "${add.teamFunds[k]}")`);
  const fields: Record<string, unknown> = {};
  if (newFunds.length) fields.teamFunds = { ...curFunds, ...Object.fromEntries(newFunds) };
  if (newCards.length) fields.cards = [...curCards, ...newCards];
  if (newSpaces.length) fields.chatSpaces = { ...curSpaces, ...Object.fromEntries(newSpaces) };
  return { fields, newFunds: newFunds.length, newCards: newCards.map((c) => c.last4), newSpaces: newSpaces.map(([k]) => k), kept };
}

/** Portal Settings keys (roles) → Chat space, from what step 6 made. */
export function spacesByRole(made: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of SPACES) if (made?.[s.key]) for (const r of s.roles) out[r] = made[s.key];
  return out;
}

export const settings: Stage = {
  id: "settings",
  title: "Portal Settings: team funds, cards and Chat spaces",
  async plan(ctx: Ctx) {
    const { g, opt, state } = ctx;
    if (!ctx.members) throw new Stop("The members Sheet hasn't been read (step 1).");
    const out: Change[] = [];
    const db = await g.getFirestore(opt.project);
    const existing = db ? await g.getDoc(opt.project, SETTINGS_DOC) : null;
    const m = mergeSettings(existing, { teamFunds: ctx.members.funds, cards: ctx.members.cards, chatSpaces: spacesByRole(state.chatSpaces) });
    if (Object.keys(m.fields).length) {
      const parts = [m.newFunds ? `${m.newFunds} team funds` : "", m.newCards.length ? `cards ending ${m.newCards.join(", ")}` : "", m.newSpaces.length ? `Chat spaces for ${m.newSpaces.join(", ")}` : ""].filter(Boolean);
      out.push({
        kind: "update",
        text: `Add to Portal Settings (${SETTINGS_DOC}): ${parts.join("; ")}. Everything already there is kept`,
        detail: m.kept.length ? m.kept : undefined,
        run: async (c) => {
          // Read again just before writing, so nothing an admin saved meanwhile is lost.
          const now = mergeSettings(await c.g.getDoc(opt.project, SETTINGS_DOC), { teamFunds: c.members!.funds, cards: c.members!.cards, chatSpaces: spacesByRole(c.state.chatSpaces) });
          if (Object.keys(now.fields).length) await c.g.mergeDoc(opt.project, SETTINGS_DOC, { ...now.fields, updatedAt: new Date().toISOString(), updatedBy: `go-live (${c.admin?.email ?? "admin"})` });
          c.state.settingsWrittenAt = new Date().toISOString();
        },
      });
    } else if (m.kept.length) out.push({ kind: "check", text: "Portal Settings already has a fund for every team on the Sheet; an admin's choices are kept", detail: m.kept });

    if (!state.sheetArchivedAt && state.sheetId) {
      if (!state.membersAddedAt) out.push({ kind: "check", text: "The Sheet is archived once everyone on it is in their groups (step 5)" });
      else {
        const { title } = await g.readSpreadsheet(state.sheetId);
        const base = title.replace(/ \(archived.*\)$/, "");
        out.push({
          kind: "update",
          text: `Archive the members Sheet: rename it "${base} (archived — Google Groups is the record now)" and add a note on its ${TAB.readMe} tab`,
          run: async (c) => {
            await c.g.renameFile(state.sheetId!, `${base} (archived — Google Groups is the record now)`);
            const day = new Date().toISOString().slice(0, 10);
            await c.g.appendRows(state.sheetId!, TAB.readMe, [[""], [`Archived on ${day} by go-live. Google Groups is the record now: add, remove or promote people in Admin console → Directory → Groups. Funds and cards are changed in the portal's Portal Settings. Changing this Sheet does nothing.`]]);
            c.state.sheetArchivedAt = new Date().toISOString();
          },
        });
      }
    }
    out.push({ kind: "check", text: `Jira isn't imported by go-live. When IT & Maintenance is ready, the facilities lead or an admin uploads Jira's CSV export at ${state.portalUrl ?? portalBase(ctx)}/it-maintenance/import` });
    return out;
  },
};
