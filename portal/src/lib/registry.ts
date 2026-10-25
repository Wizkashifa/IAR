/**
 * Every kind of request's module, as the shared pages see it. My Requests,
 * search, What's stuck, the home page and every list ask the card's module
 * here instead of checking each kind themselves, so adding a kind of
 * request means adding its module to this list (and its row in kinds.ts).
 * Each module keeps its own stages and rules; this only connects them.
 */
import type { Viewing } from "./access";
import type { Card, CardType } from "./cards";
import { eventModule } from "./events/module";
import { marketingModule } from "./marketing/module";
import type { NeedsContext, NeedsViewer } from "./needs-you";
import { purchaseModule } from "./purchases/module";
import type { NameOf, StepOptions, Steps, Viewer } from "./steps";
import type { Holder, StuckContext } from "./stuck";
import { ticketModule } from "./tickets/module";

export type ModuleDef<C extends Card = Card> = {
  type: CardType;
  /** The card is this kind and carries its module's fields. */
  is(card: Card | null | undefined): card is C;
  /** Whether this person may open it (see lib/access.ts). */
  canView(card: C, v: Viewing): boolean;
  /** Its status in words, from the module's own steps where they say more. */
  statusText(card: C): string;
  /** The step bar: the module's steps, which one it's on, and any flag. */
  steps(card: C, o: StepOptions): Steps;
  /** One sentence on who acts next, for the person looking. Empty when nothing more happens. */
  next(card: C, viewer: Viewer, names: NameOf, o: StepOptions): string;
  /** Waiting on this person (beyond the requester's own fixes and close-out). */
  needs(card: C, v: NeedsViewer, ctx: NeedsContext): boolean;
  /** Who it waits on and at which step, for What's stuck. Null when nobody has to act. */
  holder(card: C, ctx: StuckContext): Holder | null;
};

const MODULES: ModuleDef[] = [purchaseModule, eventModule, marketingModule, ticketModule] as ModuleDef[];

/** The card's module, or undefined for a kind with none yet. */
export function moduleFor(card: Card): ModuleDef | undefined {
  const m = MODULES.find((d) => d.type === card.type);
  return m?.is(card) ? m : undefined;
}

/** The kinds of request that have a module. */
export const MODULE_TYPES: CardType[] = MODULES.map((m) => m.type);
