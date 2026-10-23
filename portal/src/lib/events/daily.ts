import "server-only";
import { deliver } from "../notifications";
import { directory } from "../groups";
import * as sr from "./slot-requests";
import { slotRequestStore } from "./slot-requests-store";

/**
 * Events' part of the daily job: asks for a booked time that nobody has
 * answered get a reminder after 3 days and go to the director (or the
 * executive) after 6. Nothing is ever given up automatically.
 */
export async function daily(now: Date): Promise<string> {
  const iso = now.toISOString();
  const store = await slotRequestStore();
  const dir = await directory();
  let reminded = 0;
  let escalated = 0;
  for (const req of await store.listOpen()) {
    const next = sr.followUp(req, iso);
    if (!next) continue;
    const after = next === "remind" ? sr.markReminded(req, iso) : sr.escalate(req, dir, iso);
    try {
      await store.save(after, req.updatedAt);
    } catch {
      continue;
    }
    await deliver(sr.slotNotices(req, after, "portal"), "portal");
    if (next === "remind") reminded++;
    else escalated++;
  }
  return `${reminded} ask${reminded === 1 ? "" : "s"} reminded, ${escalated} sent to the director.`;
}
