import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Note } from "@/components/Note";
import { isDevAuth } from "@/lib/dev";
import { getViewer } from "@/lib/viewer";
import { ORG } from "@/lib/org";
import { SignInButton } from "./SignInButton";
import styles from "./signin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (isDevAuth()) redirect("/dev");
  if (await getViewer()) redirect("/");
  const { error } = await searchParams;
  return (
    <div className={styles.card}>
      {/* The green logo on light backgrounds, the white one in dark mode (docs/brand.md). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/iar-logo-green.png" alt="" className={`${styles.logo} ${styles.onLight}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/iar-logo-white.png" alt="" className={`${styles.logo} ${styles.onDark}`} />
      <h1>{ORG.shortName} Portal</h1>
      <p className="lead">Sign in with your @{ORG.domain} Google account.</p>
      {error && (
        <Note tone="bad">
          {error === "AccessDenied"
            ? `Only @${ORG.domain} accounts can use the portal. Switch accounts and try again.`
            : error === "NotInBeta"
              ? "The portal isn't open to your account yet. Ask the IAR office for access."
              : "Sign-in didn't work. Please try again."}
        </Note>
      )}
      <SignInButton auto={!error} />
    </div>
  );
}
