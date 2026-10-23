import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { runDaily } from "@/lib/daily";
import { isDevAuth } from "@/lib/dev";

export const dynamic = "force-dynamic";

const verifier = new OAuth2Client();

/**
 * Only Cloud Scheduler may run the daily job: it signs each call with a
 * Google ID token for this URL, as the service account named in
 * DAILY_INVOKER (set up by go-live). In dev mode, /dev has a button instead.
 */
async function allowed(req: Request): Promise<boolean> {
  if (isDevAuth()) return true;
  const invoker = process.env.DAILY_INVOKER?.toLowerCase();
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!invoker || !base || !token) return false;
  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience: `${base}/api/daily` });
    const p = ticket.getPayload();
    return Boolean(p?.email_verified && p.email?.toLowerCase() === invoker);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!(await allowed(req))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const results = await runDaily();
  return NextResponse.json({ results }, { status: results.every((r) => r.ok) ? 200 : 500 });
}
