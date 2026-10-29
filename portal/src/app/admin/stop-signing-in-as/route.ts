import { NextResponse } from "next/server";
import { ACT_AS_COOKIE } from "@/lib/act-as";
import { audit } from "@/lib/audit";
import { currentActAs } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/**
 * Ends signing in as someone. The "Stop" buttons post here rather than
 * calling a server action: a server action's address changes with every
 * deploy, so a tab opened before one couldn't stop. Opening the address
 * works too, from any tab, even where the banner isn't showing. Stopping
 * is always safe, so it needs no check beyond who is signed in.
 */
async function stop(req: Request) {
  const as = await currentActAs();
  if (as) await audit({ admin: as.admin, target: as.target, action: "Stopped signing in as them" });
  // 303, so a form post lands as a plain page load.
  const res = NextResponse.redirect(new URL(as ? "/admin?open=support" : "/", req.url), 303);
  res.cookies.delete(ACT_AS_COOKIE);
  return res;
}

export const GET = stop;
export const POST = stop;
