import "server-only";
import { daily as events } from "./events/daily";
import { daily as marketing } from "./marketing/daily";
import { daily as purchases } from "./purchases/daily";
import { daily as tickets } from "./tickets/daily";

/**
 * The daily job: Cloud Scheduler calls /api/daily every morning (set up by
 * go-live). Each module does its part: reminders, the morning digest,
 * escalations, preventive maintenance tickets. One module failing doesn't
 * stop the others.
 */
const JOBS: { name: string; run: (now: Date) => Promise<string> }[] = [
  { name: "Purchase Requests", run: purchases },
  { name: "Events & Rooms", run: events },
  { name: "Marketing Requests", run: marketing },
  { name: "IT & Maintenance", run: tickets },
];

export type DailyResult = { job: string; ok: boolean; summary: string };

export async function runDaily(now = new Date()): Promise<DailyResult[]> {
  const out: DailyResult[] = [];
  for (const j of JOBS) {
    try {
      out.push({ job: j.name, ok: true, summary: await j.run(now) });
    } catch (err) {
      console.error(`daily job failed: ${j.name}`, err);
      out.push({ job: j.name, ok: false, summary: err instanceof Error ? err.message : "failed" });
    }
  }
  return out;
}
