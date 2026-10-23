/**
 * One run of go-live, with everything it touches passed in: the options, a
 * Google (real or fake), the prompt and the log. main.ts wires up the real
 * ones; the tests pass the fake.
 */
import type { Google } from "./google";
import { printSummary, runStages } from "./run";
import { selectStages } from "./stages";
import type { Ctx, Log, Options, Prompt, State } from "./types";

export type RunInput = { opt: Options; g: Google; prompt: Prompt; log: Log; state: State; save: (s: State) => Promise<void>; repoRoot: string };

export async function goLive(i: RunInput) {
  const ctx: Ctx = { opt: i.opt, g: i.g, state: i.state, prompt: i.prompt, log: i.log, repoRoot: i.repoRoot, save: () => i.save(ctx.state) };
  ctx.state.project ??= i.opt.project;
  ctx.state.region ??= i.opt.region;
  if (ctx.state.project !== i.opt.project)
    i.log(`Note: .state.json was made for the project ${ctx.state.project}, and this run is for ${i.opt.project}. IDs saved for the other project won't match; move .state.json aside if that's not what you meant.`);
  i.log(i.opt.apply ? "go-live: making changes, asking before each step." : "go-live: show-only. Nothing will be changed. Add --apply to make the changes.");
  i.log(`Project ${i.opt.project}, region ${i.opt.region}, domain ${i.opt.domain}.`);
  const out = await runStages(ctx, selectStages(i.opt));
  printSummary(ctx, out);
  return { ...out, ctx };
}

export const DEFAULTS: Options = { apply: false, template: false, sync: false, production: false, redeploy: false, project: "iar-portal", region: "us-east1", domain: "islam1.org" };
