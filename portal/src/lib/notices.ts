/**
 * The shape of every portal notice, and the parts every module builds them
 * with. Each module decides who hears about what (lib/<module>/notices.ts);
 * lib/notifications.ts delivers them. Plain functions.
 */
import type { Card } from "./cards";
import { commenters, preview } from "./comments";
import type { Role } from "./org";
import { same } from "./text";

/** One person, or everyone in a role's Google Group. */
export type Recipient = { email: string } | { role: Role };

export type Notice = {
  to: Recipient;
  cardId?: string;
  href: string;
  text: string;
  /** Also send an alert in Google Chat (only when the recipient has to act). See lib/alerts.ts. */
  alert: boolean;
  /** Pass to whoever covers for the recipient while they're away. */
  delegable: boolean;
  /** On the bell only: never Chat or email (payment alerts in demo mode for anyone but testers). */
  bellOnly?: boolean;
};

/** Collects notices for one card: each recipient once, and never the person who acted. */
export function collector(cardId: string, actorEmail: string, href: string) {
  const out: Notice[] = [];
  const seen = new Set<string>();
  const add = (to: Recipient, text: string, alert: boolean) => {
    const key = "email" in to ? to.email.toLowerCase() : `role:${to.role}`;
    if (("email" in to && same(to.email, actorEmail)) || seen.has(key)) return;
    seen.add(key);
    out.push({ to, cardId, href, text, alert, delegable: false });
  };
  return { out, add };
}

/**
 * A new comment: the requester, earlier commenters and whoever else the
 * module names (who has the request now, people following it) hear about it
 * in the portal. No alert: a comment asks nothing of anyone by itself. People
 * it names with @ (on the card's newest comment) hear first, with an alert:
 * a mention asks something of them. `quote: false` leaves the words out
 * (restricted requests).
 */
export function commentNotices(card: Card, by: { email: string; name: string }, text: string, o: { href: string; what: string; also?: Recipient[]; quote?: boolean }): Notice[] {
  const { out, add } = collector(card.id, by.email, `${o.href}#comments`);
  const words = o.quote === false ? "" : `: “${preview(text)}”`;
  const last = card.comments?.at(-1);
  if (last && same(last.by, by.email)) for (const m of last.mentions ?? []) add({ email: m.email }, `${by.name} mentioned you on ${o.what}${words}`, true);
  const msg = `${by.name} commented on ${o.what}${words}`;
  for (const r of [{ email: card.ownerEmail }, ...commenters(card).map((email) => ({ email })), ...(o.also ?? [])]) add(r, msg, false);
  return out;
}
