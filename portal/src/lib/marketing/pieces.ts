import "server-only";
import { cardStore } from "../cards";
import { isMarketingCard, type MarketingCard } from "./workflow";

/** The marketing pieces linked to an event. */
export async function piecesFor(eventId: string): Promise<MarketingCard[]> {
  return (await (await cardStore()).listMarketingForEvent(eventId)).filter(isMarketingCard);
}
