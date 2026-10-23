import "server-only";

/**
 * This module's part of the daily job (lib/daily.ts): reminders and anything
 * else that happens on a schedule. Returns a one-line summary for the log.
 */
export async function daily(now: Date): Promise<string> {
  void now;
  return "Nothing to do.";
}
