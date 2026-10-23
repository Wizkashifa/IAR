"use client";
import { useEffect } from "react";
import { signIn } from "next-auth/react";

/**
 * Sends people straight to Google: anyone already signed in to their IAR
 * account comes right back signed in. With `auto` off (after an error), it
 * waits for a click so the message can be read.
 */
export function SignInButton({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (auto) void signIn("google", { callbackUrl: "/" });
  }, [auto]);
  return (
    <button className="button" onClick={() => signIn("google", { callbackUrl: "/" })}>
      {auto ? "Taking you to Google…" : "Sign in with Google"}
    </button>
  );
}
