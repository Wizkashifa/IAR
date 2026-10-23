import { redirect } from "next/navigation";
import { isDevAuth } from "@/lib/dev";
import { getViewer } from "@/lib/viewer";
import { ORG } from "@/lib/org";
import { SignInButton } from "./SignInButton";

export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (isDevAuth()) redirect("/dev");
  if (await getViewer()) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="center">
      <h1>{ORG.shortName} Portal</h1>
      <p className="lead">Sign in with your @{ORG.domain} Google account.</p>
      {error && (
        <div className="error">
          {error === "AccessDenied"
            ? `Only @${ORG.domain} accounts can use the portal. Switch accounts and try again.`
            : error === "NotInBeta"
              ? "The portal is open to a small group of testers for now. If you should be one of them, ask the IAR office to add you."
              : "Sign-in didn't work. Please try again."}
        </div>
      )}
      <SignInButton auto={!error} />
    </div>
  );
}
