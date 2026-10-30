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
import { fmtDayTime, fmtShortDay } from "../format";
import { canViewMarketing } from "./access";
import { STAGE_LABEL, type MarketingStage } from "./types";
import { type MarketingCard, TEAM_STAGES, approvalDue, holderOf, isMarketingCard, needsApproval, permission } from "./workflow";

/** The step each stage is on. */
const STEP_OF: Record<MarketingStage, string> = {
  review: STEP.newRequest,
  question: STEP.newRequest,
  declined: STEP.newRequest,
  cancelled: STEP.newRequest,
  scheduled: STEP.scheduled,
  doing: STEP.inProgress,
  proof: STEP.approval,
  ready: STEP.done,
  done: "",
};

function marketingSteps(card: MarketingCard): Steps {
  const m = card.marketing;
  // Short links and small website updates have nothing to approve, so no Approval step.
  const labels: string[] = [STEP.submitted, STEP.newRequest, STEP.scheduled, STEP.inProgress, ...(needsApproval(m.kind) ? [STEP.approval] : []), STEP.done];
  const at = m.stage === "done" ? labels.length : Math.max(1, labels.indexOf(STEP_OF[m.stage]));
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
  const by = m.doneBy ? `, to be done by ${fmtShortDay(m.doneBy)}` : "";
  switch (m.stage) {
    case "review":
      return `The marketing team picks up new requests as they come in.${mine ? ` ${NOTIFIED}` : ""}`;
    case "question":
      return `${s.does(card.ownerEmail, "answer", "answers")} the marketing team's question${quoted(m.question)}.`;
    case "scheduled":
      return `The marketing team has it scheduled${by}.`;
    case "doing":
      return m.assignee ? `${s.does(m.assignee, "are working", "is working")} on it${by}.` : `The marketing team is working on it${by}.`;
    case "proof": {
      const due = approvalDue(m);
      const ask = mine ? "ask" : "asks";
      return `${s.does(card.ownerEmail, "approve", "approves")} marketing's draft or ${ask} for changes${due ? ` by ${fmtDayTime(due)}` : ""}. With no answer by then, marketing can go ahead.`;
    }
    case "ready": {
      const sends = m.assignee ? `${s.does(m.assignee, "send", "sends")} it out` : "The marketing team sends it out";
      return `${mine ? "You" : "The requester"} approved the draft. ${sends} next.`;
    }
    default:
      return "";
  }
}

function marketingNeeds(card: MarketingCard, v: NeedsViewer): boolean {
  const m = card.marketing;
  if (permission(card, v, "schedule").ok) return true; // a new request, for anyone on the team but the requester
  if (permission(card, v, "approve").ok) return true; // the requester, with a draft to approve
  return TEAM_STAGES.includes(m.stage) && same(m.assignee, v.email);
}

function holder(card: MarketingCard): Holder | null {
  const to = holderOf(card);
  return to ? { to: [to], step: STAGE_LABEL[card.marketing.stage] } : null;
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
    case "proof":
      return state === "act" ? "Needs your approval" : "Waiting on the requester's approval";
    case "ready":
      return state === "act" ? "Needs you to send it out" : "Approved, going out";
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
