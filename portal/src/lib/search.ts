/**
 * Find a request by its number ("PO-12001", "po 12001", "12001") or by words
 * in its title, committee, payee or requester. Plain functions so they can be
 * tested; the page decides what the viewer is allowed to see first.
 */
import type { Card } from "./cards";

/**
 * A request number in the query, normalized to "PO-12001", or null. A bare
 * number is a purchase request when it's in the PO range (12001 up), and
 * otherwise has no prefix to guess, so matchCards looks it up by number.
 */
export function requestNumber(q: string): string | null {
  const m = q.trim().match(/^([a-z]{2})?[\s-]*(\d{3,})$/i);
  if (!m) return null;
  if (!m[1] && Number(m[2]) < 12001) return null;
  return `${(m[1] ?? "PO").toUpperCase()}-${m[2]}`;
}

/** The number part of a bare "1101" query, to match EV-1101, MK-1101 or TK-1101. */
const bareNumber = (q: string) => q.trim().match(/^(\d{3,})$/)?.[1] ?? null;

/** Words a request can be found by. Modules add theirs through `searchText` on the card. */
function haystack(c: Card): string {
  const p = c.purchase;
  return [c.id, c.title, c.committee, c.ownerEmail, p?.payee, p?.invoiceNumber, p?.description, c.searchText].filter(Boolean).join(" ").toLowerCase();
}

/** Cards matching every word of the query, exact request number first. */
export function matchCards(cards: Card[], q: string): Card[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const id = requestNumber(q);
  const bare = bareNumber(q);
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const c of cards) {
    if (seen.has(c.id)) continue;
    const hit = (id && c.id === id) || (bare && c.id.endsWith(`-${bare}`)) || words.every((w) => haystack(c).includes(w));
    if (hit) {
      seen.add(c.id);
      out.push(c);
    }
  }
  return out.sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : b.updatedAt.localeCompare(a.updatedAt)));
}
