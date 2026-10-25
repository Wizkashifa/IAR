import "server-only";
import { waitingFor } from "@/lib/waiting";
import type { Viewer } from "@/lib/viewer";
import styles from "./AppNav.module.css";

/** How long one person's count is reused before it's worked out again. */
const KEEP_MS = 60_000;
const g = globalThis as unknown as { __iarWaiting?: Map<string, { at: number; n: number }> };
const memo = (g.__iarWaiting ??= new Map());

/**
 * How many requests are waiting on this person, across every module (the
 * same rule as the home page's "Waiting on you", lib/waiting.ts). Kept for a minute per
 * person so moving between pages doesn't re-read every open request.
 */
export async function waitingCount(viewer: Viewer): Promise<number> {
  const key = viewer.email.toLowerCase();
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.n;
  const w = await waitingFor(viewer);
  const n = w.cards.length + w.asks.length;
  memo.set(key, { at: Date.now(), n });
  return n;
}

/** The count beside Home in the menu. Shows nothing when nothing is waiting or the count can't be worked out. */
export async function AppNavCount({ viewer }: { viewer: Viewer }) {
  let n = 0;
  try {
    n = await waitingCount(viewer);
  } catch (err) {
    console.error("waiting count failed", err);
  }
  if (!n) return null;
  return (
    <span className={styles.count} aria-label={`${n} waiting on you`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}
