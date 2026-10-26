/**
 * Step 2. Billing (asked first), the APIs, Firestore with its indexes and
 * point-in-time recovery, the two service accounts with only the roles they
 * need, and the two secrets. No service account keys, ever.
 */
import { randomBytes } from "node:crypto";
import { CLOUD_APIS, RUNTIME_SA, SCHEDULER_SA, console_, saEmail } from "../config";
import { INDEXES, type FirestoreIndex } from "../indexes";
import { askText } from "../run";
import { type Change, type Ctx, type Stage, Stop } from "../types";

const sameIndex = (a: FirestoreIndex, b: FirestoreIndex) =>
  a.collectionGroup === b.collectionGroup && a.fields.length === b.fields.length && a.fields.every((f, i) => f.path === b.fields[i].path && f.order === b.fields[i].order);

export const runtimeSa = (ctx: Ctx) => saEmail(RUNTIME_SA, ctx.opt.project);
export const schedulerSa = (ctx: Ctx) => saEmail(SCHEDULER_SA, ctx.opt.project);

/** The account Cloud Build uses for `gcloud run deploy --source` in new projects. */
const buildSa = (ctx: Ctx) => (ctx.state.projectNumber ? `${ctx.state.projectNumber}-compute@developer.gserviceaccount.com` : null);
const BUILDER = "roles/run.builder";

async function builderMissing(ctx: Ctx): Promise<string | null> {
  const sa = buildSa(ctx);
  if (!sa || !(await ctx.g.getServiceAccount(sa))) return null;
  return (await ctx.g.projectBindings(ctx.opt.project)).includes(`serviceAccount:${sa}|${BUILDER}`) ? null : sa;
}

/**
 * New projects no longer give the default build account broad roles, so a
 * source deploy fails without Cloud Run Builder. Grant it if the account
 * exists and lacks it (it appears once the APIs are on).
 */
export async function ensureBuilder(ctx: Ctx) {
  const sa = await builderMissing(ctx);
  if (sa) await ctx.g.addProjectBinding(ctx.opt.project, `serviceAccount:${sa}`, BUILDER);
}

export const cloud: Stage = {
  id: "cloud",
  title: "Google Cloud: billing, APIs, Firestore, service accounts, secrets",
  async plan(ctx) {
    const { g, opt, state } = ctx;
    const p = opt.project;
    const out: Change[] = [];

    const billing = await g.projectBilling(p);
    if (billing) out.push({ kind: "check", text: `Billing is linked (${billing})` });
    else {
      const accounts = (await g.listBillingAccounts()).filter((a) => a.open);
      out.push({
        kind: "update",
        text: `Link IAR's billing account to ${p}. Cloud Run, Firestore and backups cost a few dollars a month; step 11 sets a $25/month budget alert`,
        detail: accounts.length ? ["Billing accounts you can use:", ...accounts.map((a) => `  ${a.id}  ${a.name}`)] : [`gcloud can't see a billing account for you. Ask IAR's treasurer to give you Billing Account User on IAR's account (${console_.billing(p)}).`],
        ask: "billing",
        required: true,
        run: async (c) => {
          const id = await askText(c, "  Billing account ID to link (IAR's, never a personal one), like 0X0X0X-0X0X0X-0X0X0X:");
          if (!accounts.some((a) => a.id === id)) throw new Stop(`${id} isn't one of the billing accounts gcloud can see. Nothing was linked.`);
          await c.g.linkBilling(p, id);
          c.state.billingAccount = id;
        },
      });
    }
    if (billing && !state.billingAccount) state.billingAccount = billing;

    const enabled = await g.enabledServices(p);
    const missing = CLOUD_APIS.filter((s) => !enabled.includes(s));
    if (missing.length) out.push({ kind: "create", text: `Turn on ${missing.length} APIs: ${missing.map((s) => s.split(".")[0]).join(", ")}`, run: (c) => c.g.enableServices(p, missing) });

    const db = await g.getFirestore(p);
    if (!db) out.push({ kind: "create", text: `Create the Firestore database (Native mode) in ${opt.region}`, run: (c) => c.g.createFirestore(p, opt.region) });
    else if (db.locationId !== opt.region) out.push({ kind: "check", text: `Firestore is already in ${db.locationId} (not ${opt.region}); that's kept. A database's region can't change.` });
    if (!db?.pitr) out.push({ kind: "update", text: "Turn on Firestore point-in-time recovery (any moment in the last 7 days can be read back)", run: (c) => c.g.enablePitr(p) });

    const have = db ? await g.listIndexes(p) : [];
    for (const idx of INDEXES)
      if (!have.some((h) => sameIndex(h, idx)))
        out.push({ kind: "create", text: `Add the Firestore index on ${idx.collectionGroup} (${idx.fields.map((f) => `${f.path} ${f.order.toLowerCase()}`).join(", ")}) for ${idx.why}`, run: (c) => c.g.createIndex(p, idx) });

    const run = runtimeSa(ctx), sched = schedulerSa(ctx);
    const runSa = await g.getServiceAccount(run);
    if (!runSa) out.push({ kind: "create", text: `Create the portal's service account ${run} (no key file: it signs its own tokens)`, run: (c) => c.g.createServiceAccount(p, RUNTIME_SA, "IAR portal runtime").then(() => undefined) });
    const schedSa = await g.getServiceAccount(sched);
    if (!schedSa) out.push({ kind: "create", text: `Create ${sched}, used only by the daily job and backups`, run: (c) => c.g.createServiceAccount(p, SCHEDULER_SA, "IAR portal scheduler").then(() => undefined) });

    const projectRoles = runSa || schedSa ? await g.projectBindings(p) : [];
    const want: [string, string, string][] = [
      [`serviceAccount:${run}`, "roles/datastore.user", "read and write Firestore"],
      [`serviceAccount:${run}`, "roles/secretmanager.secretAccessor", "read its two secrets"],
      [`serviceAccount:${run}`, "roles/serviceusage.serviceUsageConsumer", "call Google Maps for address suggestions, billed to this project"],
      [`serviceAccount:${sched}`, "roles/run.invoker", "call the daily job"],
      [`serviceAccount:${sched}`, "roles/datastore.importExportAdmin", "start the nightly Firestore backup"],
    ];
    for (const [member, r, why] of want)
      if (!projectRoles.includes(`${member}|${r}`)) out.push({ kind: "create", text: `Give ${member.split(":")[1].split("@")[0]} ${r} (${why})`, run: (c) => c.g.addProjectBinding(p, member, r) });
    const self = runSa ? await g.serviceAccountBindings(run) : [];
    if (!self.includes(`serviceAccount:${run}|roles/iam.serviceAccountTokenCreator`))
      out.push({
        kind: "create",
        text: `Let ${RUNTIME_SA} sign tokens as itself (Token Creator on itself), so it never needs a key file`,
        run: (c) => c.g.addServiceAccountBinding(run, `serviceAccount:${run}`, "roles/iam.serviceAccountTokenCreator"),
      });

    const builder = await builderMissing(ctx);
    if (builder) out.push({ kind: "create", text: `Let Cloud Build build the portal: give the default build account (${builder.split("@")[0]}) ${BUILDER}`, run: ensureBuilder });

    const secrets = billing ? await g.listSecrets(p).catch(() => []) : [];
    if (!secrets.includes("nextauth-secret"))
      out.push({ kind: "create", text: "Make the sign-in session secret (nextauth-secret), random, kept only in Secret Manager", run: (c) => c.g.createSecret(p, "nextauth-secret", randomBytes(32).toString("base64")) });
    if (!secrets.includes("google-client-secret"))
      out.push({
        kind: "create",
        text: "Store the Web client's secret (google-client-secret) in Secret Manager. You paste it once; it isn't shown or saved anywhere else",
        run: async (c) => {
          const v = await askText(c, `  Paste the client secret of the "IAR Portal" Web client (${console_.credentials(p)}); it won't show as you type:`, true);
          await c.g.createSecret(p, "google-client-secret", v);
        },
      });
    return out;
  },
};
