/**
 * What every module's rules share: a line in a request's history, the
 * answer to "may this person do that?", and the error a refused step throws.
 * Each module keeps its own stages and permissions; these are only the
 * common shapes.
 */
import { lc } from "./text";

/** One line in a request's history: who did what, when, and an optional note. */
export type HistoryEntry = { at: string; by: string; action: string; note?: string };

/** Whether someone may take an action, and if not, why (shown to them). */
export type Permission = { ok: true } | { ok: false; reason: string };

/** A step the rules refuse. Its message is written for the person who tried. */
export class WorkflowError extends Error {}

/** A history line. Addresses are stored lower-case; "IAR Portal" (the daily job) is kept as is. */
export function historyEntry(by: string, at: string, action: string, note?: string): HistoryEntry {
  const who = by.includes("@") ? lc(by) : by;
  return note ? { at, by: who, action, note } : { at, by: who, action };
}

/** Throws the reason when the answer is no. */
export function must(p: Permission): void {
  if (!p.ok) throw new WorkflowError(p.reason);
}
