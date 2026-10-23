import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";

export const dynamic = "force-dynamic";

const verifier = new OAuth2Client();
const CHAT_ISSUER = "chat@system.gserviceaccount.com";

const portalUrl = () => (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");

/**
 * The IAR Portal Chat app's endpoint. Google Chat calls it when someone adds
 * the app, messages it, or adds it to a space. Alerts don't come through
 * here (the portal sends those itself, lib/chat.ts); this only answers. Every
 * call carries a Google ID token for this URL from Chat's own account
 * (Chat API configuration: authentication audience "HTTP endpoint URL").
 */
async function fromChat(req: Request): Promise<boolean> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const audience = process.env.CHAT_AUDIENCE || `${portalUrl()}/api/chat`;
  if (!token || !portalUrl()) return false;
  try {
    const p = (await verifier.verifyIdToken({ idToken: token, audience })).getPayload();
    return Boolean(p?.email_verified && p.email === CHAT_ISSUER);
  } catch {
    return false;
  }
}

type ChatEvent = { type?: string; space?: { type?: string; spaceType?: string; displayName?: string }; user?: { displayName?: string } };

export async function POST(req: Request) {
  if (!(await fromChat(req))) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const ev = (await req.json().catch(() => ({}))) as ChatEvent;
  const link = portalUrl();
  const dm = ev.space?.type === "DM" || ev.space?.spaceType === "DIRECT_MESSAGE";
  if (ev.type === "ADDED_TO_SPACE") {
    const text = dm
      ? `Assalamu alaikum${ev.user?.displayName ? `, ${ev.user.displayName}` : ""}. I'm the IAR Portal. I'll message you here when a request needs you: an approval, a question, or something sent back. Open the portal any time: ${link}`
      : `Assalamu alaikum. I'm the IAR Portal. I'll post here when this team has something new to pick up. Each request gets its own thread. ${link}`;
    return NextResponse.json({ text });
  }
  if (ev.type === "MESSAGE") {
    return NextResponse.json({ text: `I only send alerts, so I can't answer messages. To see or act on your requests, open the IAR Portal: ${link}` });
  }
  return NextResponse.json({});
}
