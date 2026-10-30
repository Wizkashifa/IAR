/**
 * The parts every module's step bar and "What happens next" line are built
 * from (each module's own in lib/<module>/module.ts; lib/next-step.ts picks
 * the right one). Plain functions.
 */
import type { Card } from "./cards";
import { FLAG } from "./glossary";
import { andList, same } from "./text";

/** "skip": passed over on purpose (no director to ask). "stopped": never reached, because the request was declined or withdrawn. */
export type StepState = "done" | "now" | "todo" | "skip" | "stopped";
export type Step = { label: string; state: StepState };
/** A request off the normal path: sent back or waiting (warn), or stopped (bad). */
export type StepFlag = { label: string; tone: "warn" | "bad" };
export type Steps = { steps: Step[]; flag?: StepFlag };

export type StepOptions = {
  /** Today in Raleigh (YYYY-MM-DD). Decides whether an event has happened. */
  today?: string;
  /** Dollars. A purchase at or above it shows the executive step before it gets there. */
  executiveThreshold?: number | null;
  /** The committee's directors, for an event. With none to review it, the director step shows as skipped. */
  directors?: string[];
  /** An event waiting on an ask about a booking made off the portal, which the IAR office answers. */
  officeAnswers?: boolean;
};

/** The person looking. `actingRoles` (their own groups, as in lib/viewer.ts) lets the text say "You" to the finance office or an executive at their step. */
export type Viewer = { email: string; actingRoles?: readonly string[] };
/** A person's name from their address. */
export type NameOf = (email: string) => string;

/** "fatima.ahmed@islam1.org" → "Fatima Ahmed": what to show when the directory has no name. */
export function fallbackName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ") || email;
}

/** Labels in order, with the index of the step the request is on (`steps.length` when finished). */
export function track(labels: string[], at: number, skip: string[] = []): Step[] {
  return labels.map((label, i) => ({ label, state: skip.includes(label) ? "skip" : i < at ? "done" : i === at ? "now" : "todo" }));
}

/** After a request stops, the steps it never reached are marked as not reached (not as skipped). */
export function stopAt(steps: Step[]): Step[] {
  return steps.map((s) => (s.state === "now" || s.state === "todo" ? { ...s, state: "stopped" as const } : s));
}

/** The flag for a request sent back, declined or withdrawn, with the steps it never reached marked. */
export function finish(card: Card, steps: Step[]): Steps {
  if (card.status === "changes_requested") return { steps, flag: { label: FLAG.sentBack, tone: "warn" } };
  const flag = card.status === "denied" ? FLAG.declined : card.status === "cancelled" ? FLAG.withdrawn : null;
  return flag ? { steps: stopAt(steps), flag: { label: flag, tone: "bad" } } : { steps };
}

/**
 * Speaking about one person: "You" for the viewer, their name for anyone else,
 * with the verb to match ("You approve" / "Fatima Ahmed approves").
 */
export function speaker(viewer: Viewer, names: NameOf) {
  const name = (email: string) => (same(email, viewer.email) ? "You" : names(email) || fallbackName(email));
  return {
    name,
    /** `who` does `you`/`they` ("approve"/"approves"). */
    does: (email: string, you: string, they: string) => `${name(email)} ${same(email, viewer.email) ? you : they}`,
    /** Several people, any of whom can act: "Ali Khan or Sara Malik". */
    anyOf: (emails: string[]) => andList(emails.map(name), "or"),
  };
}

/** A note someone wrote, quoted at the end of a sentence. */
export const quoted = (note?: string) => (note ? ` (“${note.trim()}”)` : "");
