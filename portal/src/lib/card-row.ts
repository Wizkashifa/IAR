/**
 * What a list row shows for a request, for every kind of request: title and
 * number, a short supporting line (committee, date or amount, and who has it),
 * the status in words, and the colour of its edge. Plain functions, so a
 * module page builds its list in one line (components/ItemList.tsx).
 */
import type { Card } from "./cards";
import { hrefOf } from "./card-links";
import { MARKETING_TYPES } from "./marketing/forms";
import { fallbackName, type NameOf } from "./next-step";
import { isFinished, needsViewer, type NeedsContext, type NeedsViewer } from "./needs-you";
import { TEAM_NAME as TICKET_TEAM } from "./tickets/types";

/**
 * The edge colour: gold when it needs the person looking, blue while it waits
 * on someone else, green when approved or done, red when stopped or late.
 */
export type RowState = "act" | "wait" | "done" | "bad";
/** Pill tone for each row state, so the edge and the status pill agree. */
export const ROW_TONE = { act: "warn", wait: "info", done: "ok", bad: "bad" } as const;

export type RowData = {
  id: string;
  title: string;
  /** The request's page; null for a kind with no page yet. */
  href: string | null;
  /** "Youth · Sat, Nov 21": committee, then the date, amount or place. */
  sub: string;
  /** Who has it now, in words, for the person looking ("Dee Rector: director review"). */
  who?: string;
  status: string;
  state: RowState;
};

export type RowOptions = {
  /** Today in Raleigh (YYYY-MM-DD), for late tickets. */
  today?: string;
  names?: NameOf;
  ctx?: NeedsContext;
};

const lc = (s: string) => s.trim().toLowerCase();
const same = (a?: string, b?: string) => Boolean(a && b && lc(a) === lc(b));
const raleighToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const ticketOpen = (c: Card) => c.ticket && !["resolved", "closed", "cancelled"].includes(c.ticket.status);

/** The edge colour for this person (see RowState). */
export function rowState(card: Card, viewer: NeedsViewer, o: RowOptions = {}): RowState {
  if (card.status === "denied" || card.status === "cancelled" || card.ticket?.status === "reopened") return "bad";
  if (ticketOpen(card) && card.ticket?.dueDate && card.ticket.dueDate < (o.today ?? raleighToday())) return "bad";
  if (needsViewer(card, viewer, o.ctx)) return "act";
  // Marketing work that's scheduled or under way is still waiting on the team.
  if (card.marketing) return card.marketing.stage === "done" ? "done" : "wait";
  if (isFinished(card) || card.status === "approved" || card.ticket?.status === "resolved") return "done";
  return "wait";
}

/**
 * Who has the request, short enough for a row. The saved text says "You:"
 * meaning the requester and may hold addresses; for anyone else "You" becomes
 * the requester's name, and every address becomes a name.
 */
export function whoText(card: Card, viewer: { email: string }, names: NameOf = fallbackName): string | undefined {
  const t = card.waitingOn?.trim();
  if (!t) return undefined;
  const own = same(card.ownerEmail, viewer.email);
  const named = t.replace(EMAIL, (e) => (same(e, viewer.email) ? "you" : names(e)));
  return own ? named : named.replace(/^You:/, `${names(card.ownerEmail)}:`);
}

/** Every address a list of these rows will show as a name, for lib/names.ts `nameResolver`. */
export function emailsIn(cards: Card[]): string[] {
  const out = new Set<string>();
  for (const c of cards) {
    out.add(lc(c.ownerEmail));
    for (const e of c.waitingOn?.match(EMAIL) ?? []) out.add(lc(e));
  }
  return [...out];
}

/** The supporting line: committee, then what the request is about at a glance. */
export function subText(card: Card): string {
  const parts: string[] = [];
  if (card.ticket) parts.push(TICKET_TEAM[card.ticket.team], card.ticket.room);
  else if (card.marketing) parts.push(MARKETING_TYPES[card.marketing.kind]?.label ?? "Marketing", card.committee);
  else parts.push(card.committee);
  if (card.event && card.eventDate) parts.push(day(card.eventDate));
  if (card.purchase && typeof card.amount === "number") parts.push(money(card.amount));
  if (card.marketing?.doneBy) parts.push(`done by ${day(card.marketing.doneBy)}`);
  return parts.filter(Boolean).join(" · ");
}

/**
 * Everything a list row needs, for the person looking. `status` is the
 * request's status in words (lib/status-text.ts `statusText`, which reads
 * server-only labels; components/ItemList.tsx `rowsFor` passes it in).
 */
export function cardRow(card: Card, viewer: NeedsViewer, status: string, o: RowOptions = {}): RowData {
  return {
    id: card.id,
    title: card.title,
    href: hrefOf(card),
    sub: subText(card),
    who: isFinished(card) ? undefined : whoText(card, viewer, o.names),
    status,
    state: rowState(card, viewer, o),
  };
}
