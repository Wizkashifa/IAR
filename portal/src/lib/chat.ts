import "server-only";
import { GoogleAuth } from "google-auth-library";
import { isDevAuth } from "./dev";

/**
 * Google Chat, as the "IAR Portal" Chat app. The app authenticates as the
 * Cloud Run service account itself (the chat.bot scope through the service's
 * own credentials), so there is no key and no delegation. It can message a
 * person once the app is installed for them (an admin installs it for the
 * beta group, then everyone), and post in the spaces it's been added to.
 * Setup is in docs/setup.md §8. In dev mode nothing is sent; messages are
 * kept in memory and shown on /dev.
 */

const SCOPE = "https://www.googleapis.com/auth/chat.bot";
const API = "https://chat.googleapis.com/v1";

export type ChatMessage = { text: string; cardsV2?: unknown[] };
export type ChatOutboxEntry = { at: string; to: string; text: string };

/** Chat couldn't reach this person or space, so the caller can fall back to email. */
export class ChatUnreachable extends Error {}

const g = globalThis as unknown as { __iarChatOutbox?: ChatOutboxEntry[]; __iarDm?: Map<string, string> };
const outbox: ChatOutboxEntry[] = (g.__iarChatOutbox ??= []);
const dmSpaces: Map<string, string> = (g.__iarDm ??= new Map());

/** Dev mode only: the most recent Chat messages that would have been sent. */
export function devChatOutbox(): ChatOutboxEntry[] {
  return outbox.slice(0, 30);
}

export function chatEnabled(): boolean {
  return isDevAuth() || process.env.PORTAL_CHAT === "on";
}

let auth: GoogleAuth | null = null;
async function token(): Promise<string> {
  auth ??= new GoogleAuth({ scopes: [SCOPE] });
  const t = await auth.getAccessToken();
  if (!t) throw new Error("No Google Chat token.");
  return t;
}

async function call(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<Response> {
  return fetch(`${API}/${path}`, {
    method: init.method,
    headers: { authorization: `Bearer ${await token()}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
}

/** The app's direct-message space with this person, if the app is installed for them. */
async function dmSpace(email: string): Promise<string> {
  const key = email.toLowerCase();
  const hit = dmSpaces.get(key);
  if (hit) return hit;
  const res = await call(`spaces:findDirectMessage?name=${encodeURIComponent(`users/${key}`)}`, { method: "GET" });
  if (res.status === 404 || res.status === 403) throw new ChatUnreachable(`No Chat conversation with ${key} yet.`);
  if (!res.ok) throw new Error(`Chat lookup failed: ${res.status} ${await res.text()}`);
  const space = ((await res.json()) as { name?: string }).name;
  if (!space) throw new ChatUnreachable(`No Chat conversation with ${key} yet.`);
  dmSpaces.set(key, space);
  return space;
}

async function post(space: string, msg: ChatMessage, threadKey?: string): Promise<void> {
  const q = threadKey ? "?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD" : "";
  const res = await call(`${space}/messages${q}`, { method: "POST", body: threadKey ? { ...msg, thread: { threadKey } } : msg });
  if (res.status === 404 || res.status === 403) throw new ChatUnreachable(`The portal can't post in ${space}.`);
  if (!res.ok) throw new Error(`Chat send failed: ${res.status} ${await res.text()}`);
}

function keep(to: string, text: string) {
  outbox.unshift({ at: new Date().toISOString(), to, text });
  outbox.length = Math.min(outbox.length, 100);
}

/** A direct message from the IAR Portal app. Throws ChatUnreachable when the app can't reach them. */
export async function sendDm(email: string, msg: ChatMessage): Promise<void> {
  if (isDevAuth()) return keep(`Chat message to ${email}`, msg.text);
  await post(await dmSpace(email), msg);
}

/** A post in a space the app belongs to. Posts about the same request share a thread. */
export async function postToSpace(space: string, msg: ChatMessage, threadKey?: string): Promise<void> {
  if (isDevAuth()) return keep(`Chat space ${space}`, msg.text);
  await post(space, msg, threadKey);
}
