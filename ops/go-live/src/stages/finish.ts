/**
 * Step 12: check the sign-in page answers, and print the smoke test from
 * docs/beta-launch.md. Step 13: open the beta to the Sheet's testers (asked:
 * Google may email them), or with --production open the portal to everyone.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SERVICE, role } from "../config";
import { type Change, type Ctx, type Stage, Stop } from "../types";

/** The "- [ ]" lines under "Smoke test" in docs/beta-launch.md. */
export function smokeTest(repoRoot: string): string[] {
  try {
    const md = readFileSync(join(repoRoot, "docs", "beta-launch.md"), "utf8");
    const at = md.indexOf("## Smoke test");
    const part = at < 0 ? "" : md.slice(at).split(/\n## /)[0];
    return part.split("\n").filter((l) => /^- \[ \]/.test(l)).map((l) => l.replace(/^- \[ \]\s*/, "[ ] ").replace(/\*\*/g, "").replace(/`/g, ""));
  } catch {
    return [];
  }
}

export const check: Stage = {
  id: "check",
  title: "Check it works",
  async plan(ctx: Ctx) {
    const base = ctx.state.portalUrl;
    if (!base) return [{ kind: "check", text: "The portal isn't deployed yet (step 9), so there's nothing to check" }];
    const status = await ctx.g.fetchStatus(`${base}/signin`);
    const out: Change[] = [
      { kind: "check", text: status === 200 ? `${base}/signin answers (200)` : `Problem: ${base}/signin answered ${status}, not 200. Look at the logs: gcloud run services logs read ${SERVICE} --region ${ctx.opt.region}` },
    ];
    const list = smokeTest(ctx.repoRoot);
    out.push({ kind: "check", text: "Smoke test to do by hand with two testers and a finance tester (docs/beta-launch.md):", detail: list.length ? list : ["See docs/beta-launch.md, Smoke test after deploy."] });
    return out;
  },
};

export const beta: Stage = {
  id: "beta",
  title: "Go live (beta)",
  async plan(ctx: Ctx) {
    const { g, opt, state } = ctx;
    const gate = role("beta", opt.domain);
    if (opt.production) {
      const svc = await g.getService(opt.project, opt.region, SERVICE);
      if (!svc) throw new Stop("The portal isn't deployed yet, so it can't be opened to everyone.");
      if (!svc.env.PORTAL_ACCESS_GROUP) return [{ kind: "check", text: `The portal is open to every @${opt.domain} account` }];
      return [
        {
          kind: "update",
          text: `End the beta: open the portal to every @${opt.domain} account (remove PORTAL_ACCESS_GROUP and redeploy). Install the Chat app for everyone too (Admin console → Marketplace apps)`,
          ask: "access",
          run: async (c) => {
            await c.g.updateServiceEnv(opt.project, opt.region, SERVICE, {}, ["PORTAL_ACCESS_GROUP"]);
            c.state.production = true;
          },
        },
      ];
    }
    if (!ctx.members) throw new Stop("The members Sheet hasn't been read (step 1).");
    if (state.testersAddedAt) return [{ kind: "check", text: `Testers were added to ${gate} on ${state.testersAddedAt.slice(0, 10)}. Add or remove testers there, in Admin console → Directory → Groups.` }];
    const have = new Set((await g.listMembers(gate).catch(() => [])).map((m) => m.email.toLowerCase()));
    const add = ctx.members.testers.filter((t) => !have.has(t));
    if (!ctx.members.testers.length) return [{ kind: "check", text: "The Sheet's Testers tab is empty, so nobody is added to the beta" }];
    if (!add.length) return [{ kind: "check", text: `Every tester is in ${gate}` }];
    return [
      {
        kind: "create",
        text: `Open the beta: add ${add.length === 1 ? "the 1 tester" : `the ${add.length} testers`} from the Sheet to ${gate} (${add.join(", ")})`,
        ask: "email",
        run: async (c) => {
          for (const t of add) await c.g.addMember(gate, { email: t, role: "MEMBER", type: "USER" });
          c.state.testersAddedAt = new Date().toISOString();
          c.log(`  Done. They can sign in at ${c.state.portalUrl ?? "the portal"} within 15 minutes.`);
        },
      },
    ];
  },
};
