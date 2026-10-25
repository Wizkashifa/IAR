"use client";

import { PageError } from "@/components/AppNavStates";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError retry={reset} digest={error.digest} />;
}
