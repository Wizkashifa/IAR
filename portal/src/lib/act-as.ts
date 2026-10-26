/**
 * "Sign in as someone", for portal admins troubleshooting: the signed
 * cookie that says which admin is signed in as whom, and how a request
 * saved meanwhile shows who really did it. Plain functions; lib/viewer.ts
 * reads the cookie, app/admin/actions.ts sets it.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Card } from "./cards";
import type { HistoryEntry } from "./workflow-core";

export const ACT_AS_COOKIE = "act_as";
/** How long one sign-in-as lasts before the admin is back as themselves. */
export const ACT_AS_MINUTES = 60;

export type ActAs = { admin: string; adminName: string; target: string; targetName: string; exp: number };

const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function signActAs(a: ActAs, secret: string): string {
  const body = Buffer.from(JSON.stringify(a)).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

/** The sign-in-as in the cookie, or null when it's missing, altered, expired or not for this admin. */
export function readActAs(token: string | undefined, secret: string, admin: string, now = Date.now()): ActAs | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const a = JSON.parse(Buffer.from(body, "base64url").toString()) as ActAs;
    if (typeof a.exp !== "number" || a.exp <= now) return null;
    if (a.admin.toLowerCase() !== admin.toLowerCase()) return null;
    return a;
  } catch {
    return null;
  }
}

const DETAILS = ["purchase", "event", "marketing", "ticket"] as const;
const tagNote = (a: Pick<ActAs, "adminName">) => `Done by ${a.adminName} (portal admin) while signed in as this person.`;

/**
 * The card as it will be saved, with every history line and comment added
 * since `before` marked as done by the admin on the person's behalf.
 * `before` is null for a new request.
 */
export function tagOnBehalf<C extends Card>(before: Card | null, after: C, a: Pick<ActAs, "adminName">): C {
  const note = tagNote(a);
  const tag = (h: HistoryEntry): HistoryEntry => (h.note?.includes(note) ? h : { ...h, note: h.note ? `${h.note}\n${note}` : note });
  let out: C = after;
  for (const k of DETAILS) {
    const d = after[k] as { history?: HistoryEntry[] } | undefined;
    if (!d?.history) continue;
    const seen = (before?.[k] as { history?: HistoryEntry[] } | undefined)?.history?.length ?? 0;
    out = { ...out, [k]: { ...d, history: d.history.map((h, i) => (i >= seen ? tag(h) : h)) } };
  }
  if (after.comments) {
    const seen = before?.comments?.length ?? 0;
    const by = ` (by ${a.adminName}, signed in as them)`;
    out = { ...out, comments: after.comments.map((c, i) => (i >= seen && !c.name.endsWith(by) ? { ...c, name: `${c.name}${by}` } : c)) };
  }
  return out;
}
