import { statusText } from "@/lib/status-text";
import Link from "next/link";
import { cardStore, TYPE_LABEL, type Card } from "@/lib/cards";
import { actorFor } from "@/lib/people";
import { canOpenCard } from "@/lib/access";
import { hrefOf } from "@/lib/card-links";
import { matchCards, requestNumber } from "@/lib/search";
import { requireViewer } from "@/lib/viewer";
import { fmtDate, fmtMoney } from "../purchases/ui";

export const dynamic = "force-dynamic";

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

  return (
    <>
      <h1>Search</h1>
      <form action="/search" className="searchform">
        <input type="search" name="q" defaultValue={q} placeholder="Request number (PO-12001, EV-1101) or words from the title, payee or committee" aria-label="Search requests" autoFocus />
        <button className="button" type="submit">Search</button>
      </form>
      {q && results.length === 0 && (
        <div className="panel empty">
          Nothing matches “{q}” among requests you can open. Search covers the {RECENT} most recently updated requests; for an older one, search its number.
        </div>
      )}
      {results.length > 0 && (
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Status</th>
                <th>Waiting on</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {results.map((c) => {
                const href = hrefOf(c);
                return (
                  <tr key={c.id}>
                    <td>
                      {href ? <Link href={href}><strong>{c.title}</strong></Link> : <strong>{c.title}</strong>}
                      <div className="sub">
                        {TYPE_LABEL[c.type]} {c.id} · {c.committee}
                        {c.amount !== undefined && ` · ${fmtMoney(c.amount)}`}
                        {c.ownerEmail.toLowerCase() !== actor.email && ` · ${c.ownerEmail}`}
                      </div>
                    </td>
                    <td><span className={`pill ${c.status}`}>{statusText(c)}</span></td>
                    <td>{c.waitingOn ?? <span className="sub">Nothing</span>}</td>
                    <td className="sub nowrap">{fmtDate(c.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
