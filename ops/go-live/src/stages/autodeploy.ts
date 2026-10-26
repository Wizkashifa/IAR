/**
 * Deploy on merge (run on its own: --only autodeploy). A Cloud Build trigger
 * in IAR's project watches the portal's GitHub repository. Each time a
 * change to portal/ is merged into main, it tests, builds and deploys the
 * portal (portal/cloudbuild.yaml) as its own service account,
 * portal-deployer, which can only push the image and give the running
 * service a new revision. No key files: Cloud Build reaches GitHub through
 * the Cloud Build GitHub app, which the admin installs once, by hand.
 */
import { execFileSync } from "node:child_process";
import { IMAGE_REPO, SERVICE, saEmail } from "../config";
import type { BuildTrigger } from "../google";
import { askText, byHand, confirm } from "../run";
import { type Change, type Ctx, type Stage, Stop } from "../types";
import { runtimeSa } from "./cloud";

export const DEPLOYER_SA = "portal-deployer";
export const CONNECTION = "iar-github";
export const REPO_LINK = "iar-portal";
export const TRIGGER = "portal-deploy-on-merge";
export const BUILD_CONFIG = "portal/cloudbuild.yaml";

export const deployerSa = (ctx: Ctx) => saEmail(DEPLOYER_SA, ctx.opt.project);

/** What the deployer may do, project-wide. Acting as the runtime account is granted on that account alone. */
const DEPLOYER_ROLES: [string, string][] = [
  ["roles/run.developer", "give the portal a new revision"],
  ["roles/artifactregistry.writer", `push the portal's image to ${IMAGE_REPO}`],
  ["roles/logging.logWriter", "write the build's log"],
];

/** A GitHub repository address as Cloud Build wants it (https://github.com/owner/repo.git), or null. */
export function githubRemote(url: string): string | null {
  const m = url.trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}.git` : null;
}

function gitRemote(repoRoot: string): string | null {
  try {
    return githubRemote(execFileSync("git", ["-C", repoRoot, "remote", "get-url", "origin"], { encoding: "utf8" }));
  } catch {
    return null;
  }
}

export function desiredTrigger(ctx: Ctx): BuildTrigger {
  const { project, region } = ctx.opt;
  return {
    name: TRIGGER,
    repository: `projects/${project}/locations/${region}/connections/${CONNECTION}/repositories/${REPO_LINK}`,
    branch: "^main$",
    buildConfig: BUILD_CONFIG,
    serviceAccount: deployerSa(ctx),
    // A change to the docs or to go-live doesn't redeploy the portal.
    includedFiles: ["portal/**"],
    substitutions: { _SERVICE: SERVICE, _REGION: region },
  };
}

async function repoUrl(ctx: Ctx): Promise<string> {
  if (ctx.state.autodeployRepo) return ctx.state.autodeployRepo;
  const found = gitRemote(ctx.repoRoot);
  let url = found && (await confirm(ctx, `  Deploy from ${found}?`)) ? found : null;
  while (!url) {
    url = githubRemote(await askText(ctx, "  The portal's GitHub repository, like https://github.com/iar/portal:"));
    if (!url) ctx.log("  That isn't a github.com repository address.");
  }
  ctx.state.autodeployRepo = url;
  await ctx.save();
  return url;
}

const githubSteps = (uri?: string) => [
  `1. Open ${uri ?? "the link gcloud printed"} and sign in to GitHub as someone who administers the portal's repository.`,
  "2. Authorize Google Cloud Build, then install the Cloud Build app on that repository only (not on every repository).",
];

export const autodeploy: Stage = {
  id: "autodeploy",
  title: "Deploy the portal automatically when a change is merged",
  async plan(ctx) {
    const { g, opt, state } = ctx;
    const p = opt.project, r = opt.region;
    const out: Change[] = [];
    if (!(await g.getService(p, r, SERVICE))) throw new Stop("The portal isn't deployed yet. Run go-live (or --only deploy) first; deploying on merge updates the running portal.");

    const dep = deployerSa(ctx);
    const depSa = await g.getServiceAccount(dep);
    if (!depSa) out.push({ kind: "create", text: `Create ${dep}, used only to deploy merged changes (no key file)`, run: (c) => c.g.createServiceAccount(p, DEPLOYER_SA, "IAR portal deployer").then(() => undefined) });
    const roles = await g.projectBindings(p);
    for (const [role, why] of DEPLOYER_ROLES)
      if (!roles.includes(`serviceAccount:${dep}|${role}`)) out.push({ kind: "create", text: `Give ${DEPLOYER_SA} ${role} (${why})`, run: (c) => c.g.addProjectBinding(p, `serviceAccount:${dep}`, role) });
    const run = runtimeSa(ctx);
    if (!(await g.serviceAccountBindings(run)).includes(`serviceAccount:${dep}|roles/iam.serviceAccountUser`))
      out.push({ kind: "create", text: `Let ${DEPLOYER_SA} deploy the portal to run as ${run.split("@")[0]} (Service Account User on that account only)`, run: (c) => c.g.addServiceAccountBinding(run, `serviceAccount:${dep}`, "roles/iam.serviceAccountUser") });

    // Cloud Build keeps the GitHub app's token in Secret Manager, through its own service agent.
    const number = state.projectNumber ?? (await g.getProject(p))?.projectNumber;
    const agent = number ? `serviceAccount:service-${number}@gcp-sa-cloudbuild.iam.gserviceaccount.com` : null;
    if (agent && !roles.includes(`${agent}|roles/secretmanager.admin`))
      out.push({ kind: "create", text: "Let Cloud Build keep its GitHub token in Secret Manager (roles/secretmanager.admin for the Cloud Build service agent)", run: (c) => c.g.addProjectBinding(p, agent, "roles/secretmanager.admin") });

    const conn = await g.getBuildConnection(p, r, CONNECTION);
    if (!conn?.ready)
      out.push({
        kind: conn ? "manual" : "create",
        text: `Link Cloud Build to GitHub (connection ${CONNECTION}): you install the Cloud Build app on the portal's repository`,
        detail: githubSteps(conn?.actionUri),
        required: true,
        run: async (c) => {
          const made = (await c.g.getBuildConnection(p, r, CONNECTION)) ?? (await c.g.createBuildConnection(p, r, CONNECTION));
          if (made.ready) return;
          await byHand(c, "github-connect", githubSteps(made.actionUri), async () =>
            (await c.g.getBuildConnection(p, r, CONNECTION))?.ready ? null : "Cloud Build isn't linked to GitHub yet. Finish installing the Cloud Build app on the repository.",
          );
        },
      });

    const linked = conn?.ready ? await g.getBuildRepository(p, r, CONNECTION, REPO_LINK) : null;
    if (!linked)
      out.push({
        kind: "create",
        text: `Connect the portal's repository${state.autodeployRepo ? ` (${state.autodeployRepo})` : ""} to Cloud Build`,
        required: true,
        run: async (c) => c.g.createBuildRepository(p, r, CONNECTION, REPO_LINK, await repoUrl(c)),
      });
    else out.push({ kind: "check", text: `Cloud Build reads ${linked}` });

    const want = desiredTrigger(ctx);
    const have = await g.getBuildTrigger(p, r, TRIGGER);
    if (!have)
      out.push({
        kind: "create",
        text: `Make the trigger ${TRIGGER}: each change to portal/ merged into main is tested, built and deployed as ${DEPLOYER_SA} (about 8 minutes)`,
        detail: [`Builds with ${BUILD_CONFIG}. A failed test stops it; the running portal stays as it was.`, "Watch the builds: Cloud Build → History in the Cloud console."],
        run: (c) => c.g.createBuildTrigger(p, r, desiredTrigger(c)),
      });
    else if (have.branch !== want.branch || have.buildConfig !== want.buildConfig || have.serviceAccount !== want.serviceAccount)
      out.push({ kind: "check", text: `The trigger ${TRIGGER} exists but isn't as go-live makes it (branch ${have.branch}, ${have.buildConfig}, as ${have.serviceAccount}). Delete it in Cloud Build → Triggers and run this again.` });
    else out.push({ kind: "check", text: `Merged changes to portal/ deploy automatically (trigger ${TRIGGER})` });
    return out;
  },
};
