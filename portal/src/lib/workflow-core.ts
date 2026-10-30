/**
 * What every module's rules share: a line in a request's history, the
 * answer to "may this person do that?", and the error a refused step throws.
 * Each module keeps its own stages and permissions; these are only the
 * common shapes.
 */
import type { Role } from "./org";
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

/**
 * Who is acting. `roles` must be the roles from the person's own groups, not
 * the admin "see everything" expansion: being a portal admin is a support
 * role and does not let anyone approve or pay.
 */
export type Actor = {
  email: string;
  name: string;
  roles: Role[];
  /** People who are away and asked this person to cover their approvals today. */
  covering?: string[];
  /** Funds whose requests this person may open: ones they chair, vice-chair or direct (see teams.ts). */
  oversees?: string[];
  /** Funds this person chairs: as a co-chair they can take the chair step even when another chair is named. */
  chairs?: string[];
  /** Funds this person directs: they can take the chair step on them. */
  directs?: string[];
  /** Team groups this person chairs, vice-chairs or directs: they can open those committees' requests. */
  leads?: string[];
};
