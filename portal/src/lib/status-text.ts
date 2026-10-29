/**
 * A request's status in words, using its module's own steps where they say
 * more than the shared status ("Scheduled" rather than "Approved", "Fixed:
 * please confirm" rather than "Close-out"). For lists that mix every kind of
 * request: My Requests, the home page and search. Plain function.
 */
import type { Card } from "./cards";
import type { RowState } from "./card-row";
import { STATUS_LABEL } from "./glossary";
import { moduleFor } from "./registry";

export function statusText(card: Card): string {
  return moduleFor(card)?.statusText(card) ?? STATUS_LABEL[card.status];
}

/**
 * The words on a list row's pill, for the person looking: what's needed from
 * them, who has it, or how it ended (the module's rowStatus), else statusText.
 * Only lists use it; request pages, search and alerts keep statusText.
 */
export function rowStatusText(card: Card, state: RowState): string {
  return moduleFor(card)?.rowStatus?.(card, state) ?? statusText(card);
}
