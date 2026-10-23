/**
 * Step 11. What keeps the portal running and safe once it's live: the daily
 * job (reminders, digests), a nightly Firestore backup kept 30 days, an
 * uptime check on the sign-in page that emails the admins if it fails, a
 * $25/month budget alert (asked), and a cleanup rule so old builds don't pile up.
 */
import { BACKUP_JOB, DAILY_JOB, IMAGE_REPO, backupBucket, role } from "../config";
import type { SchedulerJob } from "../google";
import { type Change, type Ctx, type Stage } from "../types";
import { schedulerSa } from "./cloud";

const TZ = "America/New_York";
const UPTIME = "IAR Portal sign-in page";
const ALERT = "IAR Portal is down";
const BUDGET = "IAR Portal";
const KEEP = 10;

const same = (a: SchedulerJob | null, b: SchedulerJob) =>
  Boolean(a) && a!.schedule === b.schedule && a!.timeZone === b.timeZone && a!.uri === b.uri && (a!.audience ?? "") === (b.audience ?? "") && a!.serviceAccount === b.serviceAccount;

export const safety: Stage = {
  id: "safety",
  title: "Running costs and safety: daily job, backups, uptime alert, budget",
  async plan(ctx: Ctx) {
    const { g, opt, state } = ctx;
    const p = opt.project, r = opt.region;
    const out: Change[] = [];
    const base = state.portalUrl;
    const sa = schedulerSa(ctx);
    const admins = role("admins", opt.domain);

    if (!base) out.push({ kind: "check", text: "The daily job and uptime check are set up once the portal is deployed (step 9)" });
    else {
      const daily: SchedulerJob = { name: DAILY_JOB, schedule: "0 7 * * *", timeZone: TZ, uri: `${base}/api/daily`, audience: `${base}/api/daily`, serviceAccount: sa };
      const cur = await g.getSchedulerJob(p, r, DAILY_JOB);
      if (!same(cur, daily))
        out.push({
          kind: cur ? "update" : "create",
          text: `${cur ? "Update" : "Create"} the daily job ${DAILY_JOB}: every day at 07:00 New York time, POST ${daily.uri}, signed as ${sa.split("@")[0]}`,
          run: (c) => c.g.putSchedulerJob(p, r, daily, "oidc"),
        });
    }

    const bucket = backupBucket(p);
    const b = await g.getBucket(bucket);
    if (!b) out.push({ kind: "create", text: `Create the backup bucket gs://${bucket} in ${r}; backups older than 30 days are deleted by themselves`, run: (c) => c.g.createBucket(p, { name: bucket, location: r, deleteAfterDays: 30 }) });
    else if (b.deleteAfterDays !== 30) out.push({ kind: "check", text: `gs://${bucket} exists without a 30-day delete rule; it's left as it is` });
    const bb = b ? await g.bucketBindings(bucket) : [];
    const firestoreAgent = state.projectNumber ? `serviceAccount:service-${state.projectNumber}@gcp-sa-firestore.iam.gserviceaccount.com` : null;
    for (const member of [`serviceAccount:${sa}`, ...(firestoreAgent ? [firestoreAgent] : [])])
      if (!bb.includes(`${member}|roles/storage.objectAdmin`))
        out.push({ kind: "create", text: `Let ${member === firestoreAgent ? "Firestore's own service agent" : member.split(":")[1].split("@")[0]} write backups to gs://${bucket}`, run: (c) => c.g.addBucketBinding(bucket, member, "roles/storage.objectAdmin") });
    const backup: SchedulerJob = {
      name: BACKUP_JOB,
      schedule: "0 2 * * *",
      timeZone: TZ,
      uri: `https://firestore.googleapis.com/v1/projects/${p}/databases/(default):exportDocuments`,
      serviceAccount: sa,
      body: JSON.stringify({ outputUriPrefix: `gs://${bucket}` }),
    };
    if (!same(await g.getSchedulerJob(p, r, BACKUP_JOB), backup))
      out.push({ kind: "create", text: `Back up Firestore every night at 02:00 to gs://${bucket} (job ${BACKUP_JOB})`, run: (c) => c.g.putSchedulerJob(p, r, backup, "oauth") });

    if (base) {
      // One check and alert per address, so moving to portal.<domain> adds a pair for it.
      const host = new URL(base).host;
      const uptime = `${UPTIME} (${host})`, alert = `${ALERT} (${host})`;
      const check = (await g.listUptimeChecks(p)).find((c) => c.displayName === uptime);
      if (!check) out.push({ kind: "create", text: `Check ${base}/signin every 5 minutes from several places (uptime check)`, run: (c) => c.g.createUptimeCheck(p, { displayName: uptime, host, path: "/signin" }).then(() => undefined) });
      const policies = await g.listAlertPolicies(p);
      if (!check || !policies.some((x) => x.displayName === alert && x.channelEmails.includes(admins)))
        out.push({
          kind: "create",
          text: `Email ${admins} when ${host}/signin stops answering (alert policy "${alert}")`,
          run: async (c) => {
            const id = (await c.g.listUptimeChecks(p)).find((x) => x.displayName === uptime)?.id;
            if (!id) throw new Error(`The uptime check "${uptime}" wasn't found.`);
            await c.g.createAlertPolicy(p, { displayName: alert, uptimeCheckId: id, email: admins });
          },
        });
    }

    const billing = state.billingAccount;
    if (billing) {
      const budgets = await g.listBudgets(p, billing);
      if (!budgets.some((x) => x.displayName === BUDGET))
        out.push({
          kind: "create",
          text: `A $25/month budget on the billing account for ${p}, emailing the billing admins and ${admins} at 50%, 90% and 100%`,
          ask: "budget",
          run: (c) => c.g.createBudget(p, billing, { displayName: BUDGET, amountUsd: 25, projects: [p], email: admins }),
        });
    }

    const keeps = await g.imageCleanupKeeps(p, r, IMAGE_REPO);
    if (keeps === "no-repo") out.push({ kind: "check", text: "The image cleanup rule is set once the first deploy has made its image repository" });
    else if (keeps !== KEEP) out.push({ kind: "update", text: `Keep only the last ${KEEP} portal builds in Artifact Registry (${IMAGE_REPO}); older ones are deleted`, run: (c) => c.g.setImageCleanup(p, r, IMAGE_REPO, KEEP) });
    return out;
  },
};
