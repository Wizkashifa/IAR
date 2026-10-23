/** The stages in order, and which ones a run uses. */
import type { Options, Stage, StageId } from "../types";
import { accounts } from "./accounts";
import { chat } from "./chat";
import { cloud } from "./cloud";
import { delegation } from "./delegation";
import { deploy } from "./deploy";
import { drives } from "./drives";
import { beta, check } from "./finish";
import { groups } from "./groups";
import { preflight } from "./preflight";
import { rooms } from "./rooms";
import { safety } from "./safety";
import { settings } from "./settings";
import { sheet } from "./sheet";

export const STAGES: Stage[] = [preflight, sheet, cloud, accounts, delegation, groups, chat, drives, rooms, deploy, settings, safety, check, beta];

/** Stages that need the members Sheet read first. */
const NEEDS_SHEET: StageId[] = ["groups", "rooms", "settings", "beta"];

export function selectStages(opt: Options): Stage[] {
  if (opt.template) return [preflight, sheet];
  if (!opt.only) return STAGES;
  const want = new Set<StageId>(["preflight", opt.only]);
  if (NEEDS_SHEET.includes(opt.only) && !(opt.only === "beta" && opt.production)) want.add("sheet");
  return STAGES.filter((s) => want.has(s.id));
}
