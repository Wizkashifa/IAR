import "server-only";
import { ConflictError } from "./cards";
import type { Notice } from "./notices";
import { deliver } from "./notifications";

/**
 * Saves one change the daily job made, then sends its notices. Returns false
 * and sends nothing when someone changed the record a moment ago: tomorrow's
 * run looks again. Any other failure is logged and skipped, so one bad
 * record doesn't stop the rest.
 */
export async function saveThenTell<T>(store: { save(x: T, expectedUpdatedAt: string): Promise<void> }, expected: string, after: T, notices: Notice[], by = "portal", at?: string): Promise<boolean> {
  try {
    await store.save(after, expected);
  } catch (err) {
    if (!(err instanceof ConflictError)) console.error("daily job: save failed", err);
    return false;
  }
  await deliver(notices, by, at);
  return true;
}
