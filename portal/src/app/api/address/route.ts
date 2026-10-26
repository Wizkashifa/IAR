import { NextResponse } from "next/server";
import { addressOf, suggestAddresses } from "@/lib/places";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** Address suggestions for the mailing address box (?q=…), and the full address of a picked one (?id=…). Signed-in people only. */
export async function GET(req: Request) {
  if (!(await getViewer())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const u = new URL(req.url);
  const session = (u.searchParams.get("session") ?? "").slice(0, 100);
  const id = u.searchParams.get("id");
  if (id) return NextResponse.json({ address: await addressOf(id, session) });
  return NextResponse.json({ suggestions: await suggestAddresses(u.searchParams.get("q") ?? "", session) });
}
