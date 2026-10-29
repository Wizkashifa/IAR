/**
 * Marketing Requests as the portal's shared pages see it: who can open one,
 * its steps and what happens next, whether it waits on someone and on whom.
 * Collected in lib/registry.ts. Plain functions.
 */
import { FLAG, NOTIFIED, STATUS_LABEL, STEP } from "../glossary";
import type { NeedsViewer } from "../needs-you";
import type { RowState } from "../card-row";
import type { ModuleDef } from "../registry";
import type { Holder } from "../stuck";
import { type NameOf, type Steps, type Viewer, quoted, speaker, stopAt, track } from "../steps";
import { same } from "../text";
import { canViewMarketing } from "./access";
import { STAGE_LABEL } from "./types";
import { type MarketingCard, isMarketingCard, permission, shortDay } from "./workflow";

function marketingSteps(card: MarketingCard): Steps {
  const m = card.marketing;
  const labels = [STEP.submitted, STEP.weeklyReview, STEP.scheduled, STEP.inProgress, STEP.done];
  const at = { review: 1, question: 1, scheduled: 2, doing: 3, done: 5, declined: 1, cancelled: 1 }[m.stage];
  const steps = track(labels, at);
  if (m.stage === "question") return { steps, flag: { label: FLAG.question, tone: "warn" } };
  if (m.stage === "declined") return { steps: stopAt(steps), flag: { label: FLAG.declined, tone: "bad" } };
  if (m.stage === "cancelled") return { steps: stopAt(steps), flag: { label: FLAG.withdrawn, tone: "bad" } };
  return { steps };
}

function marketingNext(card: MarketingCard, viewer: Viewer, names: NameOf): string {
  const m = card.marketing;
  const s = speaker(viewer, names);
  const mine = same(card.ownerEmail, viewer.email);
  const by = m.doneBy ? `, to be done by ${shortDay(m.doneBy)}` : "";
  switch (m.stage) {
    case "review":
      return `The marketing team looks at new requests in its weekly review.${mine ? ` ${NOTIFIED}` : ""}`;
    case "question":
      return `${s.does(card.ownerEmail, "answer", "answers")} the marketing team's question${quoted(m.question)}.`;
    case "scheduled":
      return `The marketing team has it scheduled${by}.`;
    case "doing":
      return m.assignee ? `${s.does(m.assignee, "are working", "is working")} on it${by}.` : `The marketing team is working on it${by}.`;
    default:
      return "";
  }
}

function marketingNeeds(card: MarketingCard, v: NeedsViewer): boolean {
  const m = card.marketing;
  if (permission(card, v, "schedule").ok) return true; // the weekly review, for the team
  return (m.stage === "scheduled" || m.stage === "doing") && same(m.assignee, v.email);
}

function holder(card: MarketingCard): Holder | null {
  const m = card.marketing;
  switch (m.stage) {
    case "review":
    case "scheduled":
      return { to: [{ role: "marketing" }], step: STAGE_LABEL[m.stage] };
    case "doing":
      return { to: [m.assignee ? { email: m.assignee } : { role: "marketing" }], step: STAGE_LABEL.doing };
    case "question":
      return { to: [{ email: card.ownerEmail }], step: STAGE_LABEL.question };
    default:
      return null;
  }
}

/** The list pill: what's needed from you, or who has it (see ModuleDef.rowStatus). */
function rowStatus(card: MarketingCard, state: RowState): string | undefined {
  switch (card.marketing.stage) {
    case "review":
      return state === "act" ? "Needs your review" : "With the marketing team";
    case "question":
      return state === "act" ? "Needs an answer from you" : "With the requester";
    case "scheduled":
      return state === "act" ? "Needs you to start it" : "Scheduled with marketing";
    case "doing":
      return state === "act" ? "Needs your work" : "Being made by marketing";
    default:
      return undefined;
  }
}

export const marketingModule: ModuleDef<MarketingCard> = {
  type: "marketing",
  is: isMarketingCard,
  canView: canViewMarketing,
  statusText: (card) => STAGE_LABEL[card.marketing.stage] ?? STATUS_LABEL[card.status],
  steps: marketingSteps,
  next: marketingNext,
  needs: marketingNeeds,
  holder,
  rowStatus,
};
