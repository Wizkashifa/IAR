import "server-only";
import { isDevAuth } from "./dev";
import { ORG } from "./org";

/**
 * A card is one request moving through its stages: an event, a purchase,
 * a rental or an aid case. Modules add their own fields on top of these.
 */
export type CardType = "event" | "purchase" | "rental" | "aid";
export type CardStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "denied"
  | "cancelled"
  | "paid"
  | "close_out"
  | "closed";

export type Card = {
  id: string;
  orgId: string;
  type: CardType;
  title: string;
  status: CardStatus;
  ownerEmail: string;
  committee: string;
  /** Who the card is waiting on right now, in words ("Finance office"). */
  waitingOn?: string;
  /** For events: when it happens. */
  eventDate?: string;
  /** For purchases: total in dollars. */
  amount?: number;
  updatedAt: string;
};

export const STATUS_LABEL: Record<CardStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
  paid: "Paid",
  close_out: "Close-out",
  closed: "Closed",
};

export const TYPE_LABEL: Record<CardType, string> = {
  event: "Event",
  purchase: "Purchase",
  rental: "Rental",
  aid: "Aid",
};

/** Statuses where the owner has to do something. */
export const NEEDS_OWNER: CardStatus[] = ["draft", "changes_requested", "close_out"];

export interface CardStore {
  listByOwner(email: string): Promise<Card[]>;
}

// ---- Development: sample cards in memory -------------------------------

function sampleCards(email: string): Card[] {
  const day = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
  const ahead = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
  const base = { orgId: ORG.id, ownerEmail: email };
  return [
    { ...base, id: "EV-1042", type: "event", title: "Youth Halaqa — winter series", status: "changes_requested", committee: "Youth", waitingOn: "You: pick a room without a school-hours conflict", eventDate: ahead(18), updatedAt: day(0) },
    { ...base, id: "PO-11045", type: "purchase", title: "Halaqa snacks and supplies", status: "in_review", committee: "Youth", waitingOn: "Finance office", amount: 184.5, updatedAt: day(1) },
    { ...base, id: "EV-1031", type: "event", title: "Family Night", status: "approved", committee: "Youth", waitingOn: "Marketing: flyer due in 6 days", eventDate: ahead(9), updatedAt: day(3) },
    { ...base, id: "EV-0998", type: "event", title: "Community Iftar volunteer briefing", status: "close_out", committee: "Social & Welfare", waitingOn: "You: attendance and final costs", eventDate: ahead(-4), updatedAt: day(4) },
    { ...base, id: "PO-10977", type: "purchase", title: "Sound system rental — Family Night", status: "paid", committee: "Youth", amount: 650, updatedAt: day(12) },
  ];
}

const memoryStore: CardStore = {
  async listByOwner(email) {
    return sampleCards(email);
  },
};

// ---- Production: Firestore ---------------------------------------------
// Cards live at orgs/{orgId}/cards/{cardId}. Needs a composite index on
// (ownerEmail ASC, updatedAt DESC); see docs/setup.md.

let firestoreStore: CardStore | null = null;

async function getFirestoreStore(): Promise<CardStore> {
  if (firestoreStore) return firestoreStore;
  const { Firestore } = await import("@google-cloud/firestore");
  const db = new Firestore();
  firestoreStore = {
    async listByOwner(email) {
      const snap = await db
        .collection("orgs").doc(ORG.id).collection("cards")
        .where("ownerEmail", "==", email.toLowerCase())
        .orderBy("updatedAt", "desc")
        .limit(100)
        .get();
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Card, "id">) }));
    },
  };
  return firestoreStore;
}

export async function cardStore(): Promise<CardStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}
