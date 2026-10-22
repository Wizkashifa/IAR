/**
 * Comments on any request (purchases now; events, marketing and tickets as
 * they move into the portal). Anyone who can open a request can comment on
 * it. Comments are the only thing a requester can add once a request is in
 * a team's hands. Plain functions so they can be tested.
 */
import type { Card } from "./cards";

export type Comment = { id: string; at: string; by: string; name: string; text: string };

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
  return { ...card, comments: [...comments, { ...c, by: c.by.toLowerCase(), id }], updatedAt: c.at };
}

/** People who have commented before, by email: they hear about new comments. */
export function commenters(card: Card): string[] {
  return [...new Set((card.comments ?? []).map((c) => c.by.toLowerCase()))];
}

export const preview = (text: string, max = 140) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
