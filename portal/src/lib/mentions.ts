import "server-only";
import { canOpenCard } from "./access";
import type { Card } from "./cards";
import type { Mention } from "./comments";
import { portalPeopleGroups } from "./groups";
import { namesFor } from "./names";
import { actorWith } from "./people";
import { purchaseContext } from "./purchases/settings";
import { viewerFrom } from "./viewer";

/**
 * Who can be named with @ in a comment on this request: everyone who can
 * already open it, by the module's own rule, so a mention never shows the
 * request to someone new. Worked out from the group directory (cached), not
 * by asking Google about each person. Sorted by name.
 */
export async function mentionablePeople(card: Card): Promise<Mention[]> {
  try {
    const [everyone, ctx] = await Promise.all([portalPeopleGroups(), purchaseContext()]);
    const open: string[] = [];
    for (const p of everyone) {
      const v = await viewerFrom(p.email, p.email, p.groups);
      if (canOpenCard(card, { ...actorWith(v, ctx), seeAll: v.roles.includes("admins") })) open.push(p.email);
    }
    const names = await namesFor(open);
    return open.map((email) => ({ email, name: names.get(email) ?? email })).sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    // Mentions are a convenience: without the directory, comments still work and reach the usual people.
    console.error("mention list failed", err);
    return [];
  }
}
