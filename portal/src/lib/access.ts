/**
 * Who can open which request, for every kind of card: the same rule decides
 * whether a request opens, shows in search, or appears in a list. Each
 * module keeps its own rule (lib/registry.ts); this picks the right one.
 */
import type { Card } from "./cards";
import type { Actor } from "./workflow-core";
import { moduleFor } from "./registry";

/** The person looking, with their own group roles; `seeAll` for portal admins doing support. */
export type Viewing = Actor & { seeAll?: boolean };

export function canOpenCard(card: Card, v: Viewing): boolean {
  const m = moduleFor(card);
  return m ? m.canView(card, v) : card.ownerEmail.toLowerCase() === v.email.toLowerCase() || Boolean(v.seeAll);
}
