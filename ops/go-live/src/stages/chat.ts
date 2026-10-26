/**
 * Step 6. The "IAR Portal" Chat app is configured by hand (Google has no API
 * for the Chat app settings or the Marketplace listing). Then go-live, as
 * you, makes one Chat space per role or queue team, adds that team's Google
 * Group and the app, and remembers each space for Portal Settings (step 10).
 */
import { SPACES, console_, role, runUrl } from "../config";
import { byHand } from "../run";
import { type Change, type Ctx, type Stage, Stop } from "../types";

export const portalBase = (ctx: Ctx) =>
  ctx.state.serviceUrl ?? (ctx.state.projectNumber ? runUrl(ctx.state.projectNumber, ctx.opt.region) : "https://<the portal's Cloud Run address>");

function steps(ctx: Ctx): string[] {
  const p = ctx.opt.project, d = ctx.opt.domain, base = portalBase(ctx);
  return [
    `1. Open ${console_.chatConfig(p)} (Google Chat API → Configuration).`,
    '   App name: IAR Portal. Avatar URL: ' + `${base}/brand/iar-logo-green.png` + '. Description: "Alerts and approvals from the IAR Portal".',
    "   Interactive features: on. Functionality: tick both \"Receive 1:1 messages\" and \"Join spaces and group conversations\".",
    "   If asked, don't build it as a Google Workspace add-on: choose the plain Chat app.",
    `   Connection settings: HTTP endpoint URL: ${base}/api/chat. Authentication audience: HTTP endpoint URL.`,
    `   (When the portal moves to portal.${d}, change this endpoint to https://portal.${d}/api/chat; go-live reminds you.)`,
    `   Visibility: "Make this Chat app available to specific people and groups in ${d}", and enter ${role("beta", d)} and ${role("admins", d)}.`,
    "   Make sure you're in one of those two groups yourself, or go-live can't add the app to the spaces. Save.",
    `2. Open ${console_.marketplaceSdk(p)} (Google Workspace Marketplace SDK → App configuration).`,
    "   App visibility: Private (only people in your domain). Installation settings: Individual + Admin Install (Chat apps can't be admin-only; the Chat visibility above still limits who sees it).",
    "   App integrations: tick Chat app (it uses the configuration from 1). Fill in the developer details with IAR's office address, save.",
    "   Store listing: app name IAR Portal, short description, the logo above, any category that fits (Admin is fine); then Publish (Private listings aren't reviewed by Google).",
    `3. Install it for the beta group: open the Google Workspace Marketplace (${console_.marketplace}), search "IAR Portal" (only ${d} sees it) →`,
    `   Admin install → certain groups: ${role("beta", d)} and ${role("admins", d)}. When the beta ends, install it for everyone.`,
  ];
}

export const chat: Stage = {
  id: "chat",
  title: "Google Chat: the IAR Portal app and one space per team",
  async plan(ctx) {
    const { g, state, opt } = ctx;
    const out: Change[] = [];
    if (!state.chatAppConfigured)
      out.push({
        kind: "manual",
        text: 'Set up the "IAR Portal" Chat app, its private Marketplace listing, and install it for the beta group',
        detail: steps(ctx),
        run: async (c) => {
          await byHand(c, "chat-app", steps(c));
          c.log("  go-live checks the app works when it adds it to the spaces, next.");
          c.state.chatAppConfigured = true;
        },
      });
    for (const s of SPACES) {
      const groupEmail = s.group(opt.domain);
      const known = state.chatSpaces?.[s.key];
      const space = known ? await g.getSpace(known) : null;
      if (!space) {
        out.push({
          kind: "create",
          text: `Create the Chat space "${s.title}" with ${groupEmail} and the IAR Portal app in it`,
          run: async (c) => {
            const group = await c.g.getGroup(groupEmail);
            if (!group) throw new Stop(`${groupEmail} doesn't exist yet. Run step 5 first.`);
            const name = await c.g.createSpace(s.title);
            (c.state.chatSpaces ??= {})[s.key] = name;
            await c.save();
            await c.g.addSpaceGroup(name, group.id);
            await addApp(c, name);
          },
        });
        continue;
      }
      const members = await g.listSpaceMembers(space.name);
      const group = await g.getGroup(groupEmail);
      if (group && !members.some((m) => m.type === "GROUP" && m.member === `groups/${group.id}`))
        out.push({ kind: "create", text: `Add ${groupEmail} to "${s.title}"`, run: (c) => c.g.addSpaceGroup(space.name, group.id) });
      if (!members.some((m) => m.type === "BOT"))
        out.push({ kind: "create", text: `Add the IAR Portal app to "${s.title}"`, run: (c) => addApp(c, space.name) });
    }
    return out;
  },
};

async function addApp(ctx: Ctx, space: string) {
  try {
    await ctx.g.addSpaceApp(space);
  } catch (e) {
    throw new Stop(`Google wouldn't add the IAR Portal app to a space: ${(e as Error).message}`, [
      "Check the Chat app configuration (step 6, part 1) is saved, and that you're in one of the groups it's visible to.",
      "Then run go-live again; the spaces already made are kept.",
    ]);
  }
}
