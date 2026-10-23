/**
 * Marketing Requests: the fields a marketing card carries on top of the
 * shared Card (see lib/cards.ts). Filled in by the Marketing Requests module.
 */
export type MarketingDetails = {
  /** The request type (MK_TYPES in the demo): graphic, signage, announce, highlight, webpage, webedit, redirect, badge, custom. */
  kind: string;
  answers: Record<string, string>;
};
