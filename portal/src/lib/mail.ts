import "server-only";
import { isDevAuth } from "./dev";
import { delegatedToken } from "./google";
import { failed } from "./health";
import { lc } from "./text";

/**
 * Plain-text email through the Gmail API, sent as the portal's own mailbox
 * (PORTAL_MAIL_FROM, e.g. portal@islam1.org) via domain-wide delegation.
 * Unset means email is off and notices stay in the portal. In dev mode
 * nothing is sent; messages are kept in memory and shown on /dev.
 */

const SCOPE = "https://www.googleapis.com/auth/gmail.send";

export type OutboxEntry = { at: string; to: string[]; subject: string; text: string };

const g = globalThis as unknown as { __iarOutbox?: OutboxEntry[] };
const outbox: OutboxEntry[] = (g.__iarOutbox ??= []);

/** Dev mode only: the most recent messages that would have been sent. */
export function devOutbox(): OutboxEntry[] {
  return outbox.slice(0, 30);
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const ADDRESS = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+$/;

/** RFC 2047 encoding so titles with Arabic or accented letters survive. */
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);

export function mailEnabled(): boolean {
  return isDevAuth() || Boolean(process.env.PORTAL_MAIL_FROM);
}

export async function sendMail(to: string[], subject: string, text: string): Promise<void> {
  const rcpt = [...new Set(to.map(lc))].filter((t) => ADDRESS.test(t));
  if (rcpt.length === 0) return;
  const subj = oneLine(subject).slice(0, 200);

  if (isDevAuth()) {
    outbox.unshift({ at: new Date().toISOString(), to: rcpt, subject: subj, text });
    outbox.length = Math.min(outbox.length, 100);
    return;
  }
  const from = process.env.PORTAL_MAIL_FROM;
  if (!from) return;

  const message = [
    `From: IAR Portal <${from}>`,
    `To: ${rcpt.join(", ")}`,
    `Subject: ${encodeHeader(subj)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text, "utf8").toString("base64"),
  ].join("\r\n");

  const token = await delegatedToken(from, SCOPE);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(message, "utf8").toString("base64url") }),
  });
  if (!res.ok) throw failed("mail", `Gmail send failed: ${res.status} ${await res.text()}`);
}
