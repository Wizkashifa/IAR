import { Note } from "./Note";
import { ToastOnLoad } from "./toast";

/**
 * What a server action sent back: a problem from `?error=` as a note at the
 * top of the page, and a confirmation from `?ok=` (looked up in the module's
 * `messages`) as a toast, as in the demo.
 */
export function FlashNote({ ok, error, messages }: { ok?: string; error?: string; messages: Record<string, string> }) {
  return (
    <>
      {error && <Note tone="bad">{error}</Note>}
      <ToastOnLoad message={ok ? messages[ok] : undefined} />
    </>
  );
}
