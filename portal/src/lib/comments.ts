/**
 * Comments on any request (purchases now; events, marketing and tickets as
 * they move into the portal). Anyone who can open a request can comment on
 * it. Comments are the only thing a requester can add once a request is in
 * a team's hands. Plain functions so they can be tested.
 */
import type { Card } from "./cards";

/** Someone named in a comment with @: they hear about it even when they otherwise wouldn't. */
export type Mention = { email: string; name: string };

export type Comment = { id: string; at: string; by: string; name: string; text: string; mentions?: Mention[] };

export const COMMENT_MAX = 2000;

export function checkComment(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: false, error: "Write a comment first." };
  if (text.length > COMMENT_MAX) return { ok: false, error: `Keep comments under ${COMMENT_MAX.toLocaleString()} characters.` };
  return { ok: true, text };
}

/** The card with the comment added. Bumps updatedAt, so anyone about to act sees there's something new. */
export function withComment<T extends Card>(card: T, c: Omit<Comment, "id">): T {
  const comments = card.comments ?? [];
  const id = `c${comments.length + 1}`;
  const mentions = c.mentions?.length ? { mentions: c.mentions.map((m) => ({ ...m, email: m.email.toLowerCase() })) } : {};
  return { ...card, comments: [...comments, { ...c, by: c.by.toLowerCase(), id, ...mentions }], updatedAt: c.at };
}

/** People who have commented before, by email: they hear about new comments. */
export function commenters(card: Card): string[] {
  return [...new Set((card.comments ?? []).map((c) => c.by.toLowerCase()))];
}

export const preview = (text: string, max = 140) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * Who the comment names with @, from the people who may be named (those who
 * can open the request). "@Name" counts when it's a whole name: "@Sam" names
 * Sam, not Samira. Longer names win, so "@Sam Lee" isn't also "@Sam". Each
 * person once; never the commenter.
 */
export function findMentions(text: string, people: Mention[], by: string): Mention[] {
  const lower = text.toLowerCase();
  const taken: [number, number][] = [];
  const out: Mention[] = [];
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    const want = `@${p.name.toLowerCase()}`;
    if (p.name.trim() === "" || p.email.toLowerCase() === by.toLowerCase() || out.some((m) => m.email === p.email.toLowerCase())) continue;
    for (let at = lower.indexOf(want); at >= 0; at = lower.indexOf(want, at + 1)) {
      const end = at + want.length;
      if (/[\p{L}\p{N}]/u.test(lower[end] ?? "") || taken.some(([a, b]) => at < b && end > a)) continue;
      taken.push([at, end]);
      out.push({ email: p.email.toLowerCase(), name: p.name });
      break;
    }
  }
  return out;
}

/** The comment's words split around each "@Name" it mentions, for highlighting them. */
export function mentionParts(text: string, mentions: Mention[] = []): { text: string; mention?: Mention }[] {
  if (!mentions.length) return [{ text }];
  const lower = text.toLowerCase();
  const out: { text: string; mention?: Mention }[] = [];
  let i = 0;
  while (i < text.length) {
    let hit: { at: number; m: Mention } | null = null;
    for (const m of mentions) {
      const at = lower.indexOf(`@${m.name.toLowerCase()}`, i);
      if (at >= 0 && (!hit || at < hit.at || (at === hit.at && m.name.length > hit.m.name.length))) hit = { at, m };
    }
    if (!hit) break;
    if (hit.at > i) out.push({ text: text.slice(i, hit.at) });
    const end = hit.at + hit.m.name.length + 1;
    out.push({ text: text.slice(hit.at, end), mention: hit.m });
    i = end;
  }
  if (i < text.length) out.push({ text: text.slice(i) });
  return out;
}
