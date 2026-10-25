import "server-only";
import { cardStore, type Card } from "@/lib/cards";
import { directory } from "@/lib/groups";
import { needsViewer } from "@/lib/needs-you";
import { actorFor } from "@/lib/people";
import { teamPeople } from "@/lib/teams";
import type { Viewer } from "@/lib/viewer";
import styles from "./AppNav.module.css";

/** How long one person's count is reused before it's worked out again. */
const KEEP_MS = 60_000;
const g = globalThis as unknown as { __iarWaiting?: Map<string, { at: number; n: number }> };
const memo = (g.__iarWaiting ??= new Map());

/**
 * How many requests are waiting on this person, across every module (the
 * same rule as the home page's "Waiting on you"). Kept for a minute per
 * person so moving between pages doesn't re-read every open request.
 */
export async function waitingCount(viewer: Viewer): Promise<number> {
  const key = viewer.email.toLowerCase();
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.n;
  const store = await cardStore();
  const [actor, dir, ...lists] = await Promise.all([
    actorFor(viewer),
    directory(),
    store.listByOwner(viewer.email),
    store.listOpenPurchases(),
    store.listByType("event"),
    store.listByType("marketing"),
    store.listByType("ticket"),
  ]);
  const cards = new Map<string, Card>();
  for (const c of lists.flat()) cards.set(c.id, c);
  const ctx = { directorsOf: (group: string) => teamPeople(dir, group).directors };
  const n = [...cards.values()].filter((c) => needsViewer(c, actor, ctx)).length;
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
