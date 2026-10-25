import { NextResponse } from "next/server";
import { canOpenCard } from "@/lib/access";
import { hrefOf, kindOf } from "@/lib/kinds";
import { cardStore, type Card } from "@/lib/cards";
import { searchPolicies } from "@/lib/library";
import { actorFor } from "@/lib/people";
import { matchCards, requestNumber } from "@/lib/search";
import { statusText } from "@/lib/status-text";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** How far back the quick search looks; the full search page says the same. */
const RECENT = 500;
/** Results shown in the header search before "See all results". */
const SHOW = 8;

export type QuickResult = { id: string; title: string; sub: string; href: string };
/** A Library file; it opens in Google Drive. */
export type QuickPolicy = { id: string; title: string; sub: string; url: string };
/** Policies shown in the header search. */
const SHOW_POLICIES = 4;

/**
 * The header search: requests matching a number or words, only ones the
 * person can open (the same rule as the search page and the request itself),
 * and policies from the Library (lib/library.ts), which everyone at IAR can read.
 */
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ results: [] }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return NextResponse.json({ results: [] });
  const actor = await actorFor(viewer);
  const store = await cardStore();
  const id = requestNumber(q);
  const [recent, exact, found] = await Promise.all([store.listRecent(RECENT), id ? store.get(id) : Promise.resolve(null), id ? Promise.resolve(null) : searchPolicies(q)]);
  const canSee = (c: Card) => canOpenCard(c, { ...actor, seeAll: viewer.roles.includes("admins") });
  const results: QuickResult[] = matchCards([...(exact ? [exact] : []), ...recent], q)
    .filter(canSee)
    .flatMap((c) => {
      const href = hrefOf(c);
      return href ? [{ id: c.id, title: c.title, sub: `${kindOf(c.type)?.one ?? ""} ${c.id} · ${statusText(c)}`, href }] : [];
    })
    .slice(0, SHOW);
  const policies: QuickPolicy[] = (found ?? []).slice(0, SHOW_POLICIES).map((f) => ({ id: f.id, title: f.name, sub: [f.kind.label, f.folder].filter(Boolean).join(" · "), url: f.url }));
  return NextResponse.json({ results, policies });
}
