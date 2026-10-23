/**
 * Step 1. --template makes the blank members Sheet in the admin's Drive and
 * stops. Otherwise read the filled-in Sheet, check it (parseSheet), and check
 * every address is a real account; stop on any problem, listing them all.
 */
import { TAB, parseSheet, templateTabs } from "../sheet";
import { type Change, type Ctx, type Stage, Stop } from "../types";

const n = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;
export const sheetIdOf =(s: string) => s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? s.trim();

/** Where each address in the plan came from, for the error list. */
function addresses(ctx: Ctx): Map<string, string> {
  const p = ctx.members!;
  const out = new Map<string, string>();
  const add = (e: string, where: string) => out.has(e) || out.set(e, where);
  const archived = Boolean(ctx.state.sheetArchivedAt);
  if (!archived) {
    for (const m of p.members) add(m.email, `${TAB.groups} tab (${m.groupName})`);
    for (const pl of p.pillars) for (const d of pl.directors) add(d, `${TAB.pillars} tab (${pl.name})`);
    for (const c of p.cards) add(c.holderEmail, `${TAB.cards} tab (card ending ${c.last4})`);
  }
  if (!ctx.state.testersAddedAt) for (const t of p.testers) add(t, `${TAB.testers} tab`);
  return out;
}

export const sheet: Stage = {
  id: "sheet",
  title: "The members Sheet",
  async plan(ctx) {
    const { opt, state, g } = ctx;
    if (opt.template)
      return [
        {
          kind: "create",
          text: "Make the blank members Sheet in your Drive (no people in it), for the office to fill in",
          run: async (c) => {
            const s = await c.g.createSpreadsheet("IAR Portal members", templateTabs(opt.domain));
            c.state.sheetId = s.id;
            c.log(`  The Sheet is ready: ${s.url}`);
            c.log("  Share it with whoever fills it in (office, chairs). When it's done, run go-live again.");
          },
        },
      ];
    const id = opt.sheet ? sheetIdOf(opt.sheet) : state.sheetId;
    if (!id) throw new Stop("Which members Sheet? Run with --sheet <its link>, or --template to make a blank one first.");
    const { title, tabs } = await g.readSpreadsheet(id);
    const parsed = parseSheet(tabs, opt.domain);
    if (!parsed.ok) throw new Stop(`The members Sheet "${title}" has ${parsed.errors.length} problem${parsed.errors.length === 1 ? "" : "s"}. Fix them all, then run again. Nothing was changed.`, parsed.errors);
    ctx.members = parsed.plan;

    const problems: string[] = [];
    for (const [email, where] of addresses(ctx)) {
      const u = await g.getUser(email);
      if (!u) problems.push(`${email} (${where}) isn't an account in ${opt.domain}. Check the spelling in Admin console → Directory → Users.`);
      else if (u.suspended) problems.push(`${email} (${where}) is suspended.`);
    }
    if (problems.length) throw new Stop(`${problems.length} address${problems.length === 1 ? "" : "es"} in the members Sheet can't be used. Fix them all, then run again. Nothing was changed.`, problems);

    const p = parsed.plan;
    const out: Change[] = [];
    if (!state.sheetId || state.sheetId !== id)
      out.push({ kind: "update", text: `Remember the members Sheet "${title}" for later runs`, run: async (c) => void (c.state.sheetId = id) });
    out.push({
      kind: "check",
      text: `Read "${title}": ${n(p.members.length, "group membership")}, ${n(p.pillars.length, "pillar")}, ${n(Object.keys(p.funds).length, "team fund")}, ${n(p.cards.length, "card")}, ${n(p.testers.length, "tester")}, ${n(p.rooms.length, "room")}. Every address is a real account.`,
    });
    if (state.sheetArchivedAt) out.push({ kind: "check", text: `It was archived on ${state.sheetArchivedAt.slice(0, 10)}: Google Groups is the record now, so nobody is added from it again.` });
    return out;
  },
  last: (ctx) => (ctx.opt.template ? "The blank Sheet is made (or would be, with --apply). Fill it in, then run go-live with --sheet <its link>." : null),
};
