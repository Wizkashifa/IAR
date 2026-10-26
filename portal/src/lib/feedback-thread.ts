/**
 * Replies on a piece of feedback: who may open it, and who hears about a
 * reply. Plain functions (lib/feedback.ts holds the store).
 */
import { preview } from "./comments";
import { collector, type Notice } from "./notices";

type Thread = { id: string; by: string };
type Reader = { email: string; roles: readonly string[] };

const isAdmin = (v: Reader) => v.roles.includes("admins");

/** Portal admins see all feedback; everyone else sees only what they sent. */
export function mayOpenFeedback(f: Thread, v: Reader): boolean {
  return isAdmin(v) || f.by.toLowerCase() === v.email.toLowerCase();
}

/**
 * A reply: from an admin, the person who sent the feedback hears about it in
 * the portal and in Google Chat; from the sender, the portal admins do. Never
 * the person replying.
 */
export function replyNotices(f: Thread, by: Reader & { name: string }, text: string): Notice[] {
  const { out, add } = collector(f.id, by.email, `/feedback/${f.id}#comments`);
  const quote = `“${preview(text)}”`;
  if (isAdmin(by)) add({ email: f.by }, `${by.name} replied to your portal feedback: ${quote}`, true);
  else add({ role: "admins" }, `${by.name} replied about their portal feedback: ${quote}`, true);
  return out;
}
