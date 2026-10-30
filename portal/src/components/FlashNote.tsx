import { Note } from "./Note";
import { ToastOnLoad } from "./toast";

/**
 * What a server action sent back: a problem from `?error=` as a note at the
 * top of the page, and a confirmation from `?ok=` (looked up in the module's
 * `messages`, then in the ones every page shares) as a toast, as in the demo.
 */
const SHARED: Record<string, string> = {
  // lib/card-actions.ts commentOnCard, on every request page.
  commented: "Comment added. Everyone on this request can see it.",
  saved: "Saved.",
};

export function FlashNote({ ok, error, messages = {} }: { ok?: string; error?: string; messages?: Record<string, string> }) {
  return (
    <>
      {error && <Note tone="bad">{error}</Note>}
      <ToastOnLoad message={ok ? (messages[ok] ?? SHARED[ok]) : undefined} />
    </>
  );
}
