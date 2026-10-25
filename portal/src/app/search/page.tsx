import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { ItemList, rowsFor } from "@/components/ItemList";
import { ModuleHead } from "@/components/ModuleHead";
import { canOpenCard } from "@/lib/access";
import { todayLocal } from "@/lib/away";
import { emailsIn } from "@/lib/card-row";
import { cardStore, type Card } from "@/lib/cards";
import { nameResolver } from "@/lib/names";
import { actorFor } from "@/lib/people";
import { matchCards, requestNumber } from "@/lib/search";
import { requireViewer } from "@/lib/viewer";
import { needsContext } from "@/lib/waiting";
import styles from "./search.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search" };

/** How far back search looks (most recently updated cards). */
const RECENT = 500;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: raw = "" } = await searchParams;
  const q = raw.trim().slice(0, 100);
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const store = await cardStore();

  let results: Card[] = [];
  if (q) {
    const id = requestNumber(q);
    const [recent, exact] = await Promise.all([store.listRecent(RECENT), id ? store.get(id) : Promise.resolve(null)]);
    // Same rule as opening the request: anything you can't open, search doesn't show.
    const canSee = (c: Card) => canOpenCard(c, { ...actor, seeAll: viewer.roles.includes("admins") });
    results = matchCards([...(exact ? [exact] : []), ...recent], q).filter(canSee).slice(0, 50);
  }
  const [names, ctx] = await Promise.all([nameResolver(emailsIn(results)), needsContext()]);
  // Someone else's request says whose it is.
  const rows = rowsFor(results, actor, { names, today: todayLocal(), ctx }).map((r, i) =>
    results[i].ownerEmail.toLowerCase() === actor.email ? r : { ...r, sub: `${r.sub} · from ${names(results[i].ownerEmail)}` },
  );

  return (
    <div className="stack">
      <ModuleHead title="Search" lead="Find any request you can open, by its number or by words from its title, payee or committee." />
      <form action="/search" className={styles.form} role="search">
        <input type="search" name="q" defaultValue={q} placeholder="PO-12001, EV-1101, or words like “halaqa snacks”" aria-label="Search requests" autoFocus />
        <Button type="submit" variant="primary" icon="search">
          Search
        </Button>
      </form>
      {q && (
        <ItemList
          title={`Results for “${q}”`}
          right={<span>{results.length === 50 ? "First 50" : results.length}</span>}
          rows={rows}
          empty={`Nothing matches “${q}” among requests you can open. Search looks through the ${RECENT} most recently updated requests; for an older one, search its number.`}
        />
      )}
    </div>
  );
}
