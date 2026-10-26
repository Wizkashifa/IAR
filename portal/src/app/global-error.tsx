"use client";

import "./globals.css";
import { Button } from "@/components/Button";

/** When even the portal's frame fails to load. Plain on purpose: nothing here depends on the parts that may have broken. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="center stack">
          <h1>The portal didn&apos;t load</h1>
          <p className="lead">Please try again in a moment. If it keeps happening, tell the portal admins.</p>
          <p>
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
          </p>
        </main>
      </body>
    </html>
  );
}
