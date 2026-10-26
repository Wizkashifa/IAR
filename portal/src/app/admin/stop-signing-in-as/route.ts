import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACT_AS_COOKIE } from "@/lib/act-as";
import { audit } from "@/lib/audit";
import { currentActAs } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/**
 * Ends signing in as someone from any tab, by opening this address. A plain
 * link, so it works even where the banner isn't showing. Stopping is always
 * safe, so it needs no form.
 */
export async function GET(req: Request) {
  const as = await currentActAs();
  (await cookies()).delete(ACT_AS_COOKIE);
  if (as) await audit({ admin: as.admin, target: as.target, action: "Stopped signing in as them" });
  return NextResponse.redirect(new URL(as ? "/admin?open=support" : "/", req.url));
}
