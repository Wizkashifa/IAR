/**
 * Runs the stages in order. For each: plan (reads only), print every change
 * in plain language, and, with --apply, ask "Apply? (y/N)" and do it. Changes
 * that cost money, email people, widen access or remove something get their
 * own yes. Show-only (the default) never changes anything.
 */
import { ASK_LABEL, type Change, type Ctx, STAGE_IDS, type Stage, Stop } from "./types";

const MARK: Record<Change["kind"], string> = { create: "+ add   ", update: "~ change", remove: "- remove", manual: "! by hand", check: "  check " };

export const isChange = (c: Change) => c.kind !== "check";

export async function confirm(ctx: Ctx, question: string): Promise<boolean> {
  const a = (await ctx.prompt({ kind: "yesno", question: `${question} (y/N)` })).trim().toLowerCase();
  return a === "y" || a === "yes";
}

export async function askText(ctx: Ctx, question: string, secret = false): Promise<string> {
  for (;;) {
    const a = (await ctx.prompt({ kind: secret ? "secret" : "text", question })).trim();
    if (a) return a;
    ctx.log("  (Nothing entered. Try again, or press Ctrl+C to stop.)");
  }
}

/**
 * A step Google has no API for: print the exact instructions, wait for Enter,
 * then check it worked. `verify` returns null when it did, or what's wrong.
 */
export async function byHand(ctx: Ctx, step: string, lines: string[], verify?: () => Promise<string | null>): Promise<void> {
  ctx.log("");
  for (const l of lines) ctx.log(`    ${l}`);
  for (;;) {
    await ctx.prompt({ kind: "enter", question: "  Press Enter when that's done.", step });
    if (!verify) return; // The next change checks it.
    const problem = await verify();
    if (!problem) {
      ctx.log("  Checked: that worked.");
      return;
    }
    ctx.log(`  Not yet: ${problem}`);
    if (!(await confirm(ctx, "  Check again?"))) throw new Stop(`Stopped at a step done by hand: ${problem}`, ["Run go-live again when it's done; everything before it is kept."]);
  }
}

export function printChange(ctx: Ctx, c: Change) {
  const tag = c.ask ? `  [${ASK_LABEL[c.ask]}]` : "";
  ctx.log(`  ${MARK[c.kind]}  ${c.text}${tag}`);
  for (const d of c.detail ?? []) ctx.log(`              ${d}`);
}

export type StageResult = { id: string; title: string; changes: number; applied: number; skipped: number; status: "nothing to do" | "shown" | "applied" | "stopped" };

/** Run the stages; returns what happened in each, for the summary. */
export async function runStages(ctx: Ctx, stages: Stage[]): Promise<{ results: StageResult[]; stopped?: Stop }> {
  const results: StageResult[] = [];
  for (const stage of stages) {
    ctx.log("");
    ctx.log(`Step ${STAGE_IDS.indexOf(stage.id)} of ${STAGE_IDS.length - 1}: ${stage.title}`);
    let planned: Change[];
    try {
      planned = await stage.plan(ctx);
    } catch (e) {
      if (e instanceof Stop) return stopHere(ctx, results, stage, e);
      throw e;
    }
    const changes = planned.filter(isChange);
    for (const c of planned) printChange(ctx, c);
    const r: StageResult = { id: stage.id, title: stage.title, changes: changes.length, applied: 0, skipped: 0, status: "nothing to do" };
    results.push(r);
    if (!changes.length) {
      if (!planned.length) ctx.log("  Nothing to do: it's all in place.");
    } else if (!ctx.opt.apply) {
      r.status = "shown";
    } else {
      if (!(await confirm(ctx, changes.length === 1 ? "Apply this change?" : `Apply these ${changes.length} changes?`))) {
        r.status = "stopped";
        return { results, stopped: new Stop(`Stopped before "${stage.title}". Nothing in it was changed.`) };
      }
      const accepted: Change[] = [];
      for (const c of changes) {
        if (c.ask && !(await confirm(ctx, `  [${ASK_LABEL[c.ask]}] ${c.text}. Go ahead with this one?`))) {
          r.skipped++;
          if (c.required) {
            r.status = "stopped";
            return { results, stopped: new Stop(`Stopped: "${c.text}" is needed before going on.`) };
          }
          continue;
        }
        accepted.push(c);
      }
      try {
        if (stage.apply) await stage.apply(ctx, accepted);
        else for (const c of accepted) await c.run?.(ctx);
        r.applied = accepted.length;
        r.status = "applied";
      } catch (e) {
        await ctx.save();
        if (e instanceof Stop) {
          r.status = "stopped";
          return { results, stopped: e };
        }
        throw e;
      }
      await ctx.save();
    }
    const end = stage.last?.(ctx);
    if (end) return { results, stopped: new Stop(end) };
  }
  return { results };
}

function stopHere(ctx: Ctx, results: StageResult[], stage: Stage, e: Stop) {
  results.push({ id: stage.id, title: stage.title, changes: 0, applied: 0, skipped: 0, status: "stopped" });
  return { results, stopped: e };
}

export function printSummary(ctx: Ctx, out: { results: StageResult[]; stopped?: Stop }) {
  ctx.log("");
  ctx.log("Summary");
  for (const r of out.results) {
    const what = r.status === "applied" ? `done (${r.applied} applied${r.skipped ? `, ${r.skipped} skipped` : ""})` : r.status === "shown" ? `${r.changes} change${r.changes === 1 ? "" : "s"} to make` : r.status;
    ctx.log(`  ${r.title}: ${what}`);
  }
  if (out.stopped) {
    ctx.log("");
    ctx.log(out.stopped.message);
    for (const l of out.stopped.lines) ctx.log(`  ${l}`);
  } else if (!ctx.opt.apply && out.results.some((r) => r.status === "shown")) {
    ctx.log("");
    ctx.log("Nothing was changed. To make these changes, run again with --apply (you'll be asked before each step).");
  }
}
