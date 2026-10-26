/**
 * Where a request is and what happens next, for the step bar and the
 * "What happens next" line on every request page. Each module writes its
 * own (lib/<module>/module.ts); these pick the card's. Plain functions that
 * never change a request.
 *
 * nextStepText is written for the person looking. "You" means them, and only
 * when they are the one who acts; everyone else is named. The saved
 * `waitingOn` text says "You:" meaning the requester, so it's only right to
 * show it to the requester; pages use this instead.
 */
import type { Card } from "./cards";
import { STEP } from "./glossary";
import { moduleFor } from "./registry";
import { type NameOf, type StepOptions, type Steps, type Viewer, fallbackName, finish, track } from "./steps";

/** The step bar for a request: its module's own steps, which one it's on, and any flag. */
export function stepsFor(card: Card, o: StepOptions = {}): Steps {
  const m = moduleFor(card);
  if (m) return m.steps(card, o);
  // Anything without its own steps (rentals, later): the shared statuses.
  const labels = [STEP.submitted, "In review", STEP.approved, STEP.closed];
  const at = { draft: 0, submitted: 1, in_review: 1, changes_requested: 1, approved: 2, paid: 3, close_out: 3, closed: 4, denied: 1, cancelled: 1 }[card.status];
  return finish(card, track(labels, at));
}

/**
 * One sentence on who acts next and what follows, for the person looking.
 * Empty when nothing more happens (finished, declined or withdrawn).
 * `names` turns an address into a name (lib/names.ts); pass `fallbackName` until it exists.
 */
export function nextStepText(card: Card, viewer: Viewer, names: NameOf = fallbackName, o: StepOptions = {}): string {
  return moduleFor(card)?.next(card, viewer, names, o) ?? "";
}
