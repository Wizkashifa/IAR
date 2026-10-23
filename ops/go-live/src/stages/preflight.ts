/**
 * Step 0. This computer has what go-live needs, gcloud is signed in as an IAR
 * account, the Cloud project exists under the organization, and go-live's own
 * sign-in client (a Desktop OAuth client, made by hand) is here. Then the
 * admin signs in through their browser and go-live checks they're a super admin.
 *
 * The project comes first because the sign-in clients live in it.
 */
import { ADMIN_SCOPES, WORKSPACE_APIS, console_ } from "../config";
import { byHand } from "../run";
import type { ClientFile } from "../google";
import { type Change, type Ctx, type Stage, Stop } from "../types";

async function signIn(ctx: Ctx, client: ClientFile) {
  ctx.log("  Signing you in to Google in your browser (go-live keeps the sign-in in memory only)...");
  const who = await ctx.g.signIn(client, ADMIN_SCOPES, ctx.opt.domain);
  if (!who.email.toLowerCase().endsWith(`@${ctx.opt.domain}`)) throw new Stop(`You signed in as ${who.email}. Sign in with your @${ctx.opt.domain} account; never a personal one.`);
  const gcloud = (await ctx.g.gcloudAccount())?.toLowerCase();
  if (gcloud !== who.email.toLowerCase()) throw new Stop(`gcloud is signed in as ${gcloud}, but you signed in to the browser as ${who.email}. Use the same IAR account for both: gcloud auth login ${who.email}`);
  const me = await ctx.g.getUser(who.email);
  if (!me?.isAdmin) throw new Stop(`${who.email} isn't a super admin of ${ctx.opt.domain}. go-live needs a Workspace super admin.`);
  ctx.admin = who;
  ctx.log(`  Signed in as ${who.email} (super admin).`);
}

function clientSteps(ctx: Ctx): string[] {
  const p = ctx.opt.project;
  return [
    "go-live and the portal each need a sign-in client in the project. Google has no API for these, so make them by hand:",
    `1. Open ${console_.consent(p)}`,
    `   Set up the consent screen (Google Auth Platform → Branding/Audience): app name "IAR Portal", user type Internal, support and contact email your own @${ctx.opt.domain} address.`,
    `2. Open ${console_.credentials(p)} → Create credentials → OAuth client ID.`,
    "   Application type: Web application. Name: IAR Portal. Leave the redirect URIs empty for now; go-live tells you what to add after it deploys.",
    "   Copy its Client ID; go-live asks for it next. Keep the client secret to hand too (step 2 asks for it once).",
    "3. Create credentials → OAuth client ID again. Application type: Desktop app. Name: go-live.",
    "   Download its JSON and save it in the ops/go-live folder as client_secret.json (it's gitignored, and only lets go-live ask you to sign in).",
  ];
}

export const preflight: Stage = {
  id: "preflight",
  title: "Check this computer and sign in",
  async plan(ctx) {
    const { g, opt, state } = ctx;
    const out: Change[] = [];
    const tools = await g.tools();
    const [major] = tools.node.replace(/^v/, "").split(".").map(Number);
    if (major < 20) throw new Stop(`go-live needs Node 20 or later; this computer has ${tools.node}.`);
    if (!tools.gcloud) throw new Stop("The gcloud CLI isn't installed. Install it from https://cloud.google.com/sdk/docs/install, then run: gcloud auth login");
    const account = await g.gcloudAccount();
    if (!account) throw new Stop(`gcloud isn't signed in. Run: gcloud auth login <your @${opt.domain} address>`);
    if (!account.toLowerCase().endsWith(`@${opt.domain}`)) throw new Stop(`gcloud is signed in as ${account}. Sign in with your @${opt.domain} account instead (gcloud auth login); never use a personal account.`);
    out.push({ kind: "check", text: `Node ${tools.node}, gcloud ${tools.gcloud}, signed in to gcloud as ${account}` });

    const project = await g.getProject(opt.project);
    if (project) {
      const org = await g.findOrganization(opt.domain);
      if (!org || project.parent !== `organizations/${org}`) throw new Stop(`The project ${opt.project} exists but isn't directly under the ${opt.domain} organization. Use a project in IAR's organization (--project <id>).`);
      state.projectNumber = project.projectNumber;
      out.push({ kind: "check", text: `Cloud project ${opt.project} is in the ${opt.domain} organization` });
    } else {
      out.push({
        kind: "create",
        text: `Create the Cloud project ${opt.project} under the ${opt.domain} organization (no cost by itself; billing is step 2)`,
        required: true,
        run: async (c) => {
          const org = await c.g.findOrganization(opt.domain);
          if (!org) throw new Stop(`gcloud can't see the ${opt.domain} organization. Sign in to gcloud as an IAR admin who can create projects there.`);
          const p = await c.g.createProject(opt.project, org, "IAR Portal");
          c.state.project = p.projectId;
          c.state.projectNumber = p.projectNumber;
          await c.save();
        },
      });
    }

    const enabled = project ? await g.enabledServices(opt.project) : [];
    const missing = WORKSPACE_APIS.filter((s) => !enabled.includes(s));
    if (missing.length)
      out.push({
        kind: "create",
        text: `Turn on the ${missing.length} Workspace APIs go-live calls (free): ${missing.map((s) => s.split(".")[0]).join(", ")}`,
        required: true,
        run: async (c) => c.g.enableServices(opt.project, missing),
      });

    const client = await g.findClientFile(opt.client);
    const clientsDone = Boolean(client && state.webClientId);
    if (client && client.projectId !== opt.project) throw new Stop(`${client.path} is a client from the project ${client.projectId}, not ${opt.project}. Make the Desktop client in ${opt.project}.`);
    if (client && !client.desktop) throw new Stop(`${client.path} isn't a Desktop app client. Create one with application type "Desktop app".`);
    if (!clientsDone)
      out.push({
        kind: "manual",
        text: "Make the consent screen (Internal) and two sign-in clients: Web (for the portal) and Desktop (for go-live)",
        detail: clientSteps(ctx),
        run: async (c) => {
          await byHand(c, "oauth-clients", clientSteps(c), async () => {
            const f = await c.g.findClientFile(opt.client);
            if (!f) return "there's no client_secret*.json in ops/go-live yet.";
            if (!f.desktop) return `${f.path} isn't a Desktop app client.`;
            if (f.projectId !== opt.project) return `${f.path} belongs to ${f.projectId}, not ${opt.project}.`;
            return null;
          });
          const num = c.state.projectNumber ?? (await c.g.getProject(opt.project))?.projectNumber;
          for (;;) {
            const id = (await c.prompt({ kind: "text", question: "  Paste the Web application's Client ID:" })).trim();
            if (/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id) && (!num || id.startsWith(`${num}-`))) {
              c.state.webClientId = id;
              break;
            }
            c.log(`  That doesn't look like a client ID from ${opt.project} (it starts with the project number ${num}). Try again.`);
          }
          await c.save();
        },
      });

    // Sign in now if everything for it exists; otherwise after this step is applied.
    if (client && project && !missing.length) await signIn(ctx, client);
    return out;
  },
  async apply(ctx, changes) {
    for (const c of changes) await c.run?.(ctx);
    if (!ctx.admin) {
      const client = await ctx.g.findClientFile(ctx.opt.client);
      if (!client) throw new Stop("go-live's Desktop sign-in client isn't in ops/go-live yet.");
      await signIn(ctx, client);
    }
  },
  last(ctx) {
    return ctx.admin ? null : "go-live can't look any further until the project and its sign-in clients exist. Run with --apply to do step 0, then run again to see the rest.";
  },
};
