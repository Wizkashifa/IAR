import "server-only";
import { type ActAs, tagOnBehalf } from "./act-as";
import { audit } from "./audit";
import { clean, firestore } from "./db";
import { isDevAuth } from "./dev";
import type { Comment } from "./comments";
import type { EventDetails } from "./events/types";
import type { MarketingDetails } from "./marketing/types";
import type { PurchaseDetails } from "./purchases/types";
import type { TicketDetails } from "./tickets/types";

/**
 * A card is one request moving through its stages: an event, a purchase, a
 * marketing request, an IT or maintenance ticket, or (later) a rental.
 * Modules add their own fields on top of these.
 */
export type CardType = "event" | "purchase" | "marketing" | "ticket" | "rental";
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
  createdAt?: string;
  /** Payments module fields (type "purchase"). */
  purchase?: PurchaseDetails;
  /** Events & Rooms module fields (type "event"). */
  event?: EventDetails;
  /** Marketing Requests module fields (type "marketing"). */
  marketing?: MarketingDetails;
  /** IT & Maintenance module fields (type "ticket"). */
  ticket?: TicketDetails;
  /** Comments from anyone who can open the request (see comments.ts). */
  comments?: Comment[];
  /** Extra words search should find it by (room, payee, equipment…), set by the module. */
  searchText?: string;
};

/**
 * Request numbers by prefix, and where each starts. Purchases start after the
 * old Requisition Form's numbers.
 */
/** How many requests of one type a list reads at most. */
const LIST_LIMIT = 2000;

export const COUNTER_START: Record<string, number> = { PO: 12001, EV: 1101, MK: 1001, TK: 1001 };

/** Statuses where the owner has to do something. */
export const NEEDS_OWNER: CardStatus[] = ["draft", "changes_requested", "close_out"];

/** Statuses a card can still move from. */
export const OPEN_STATUSES: CardStatus[] = ["submitted", "in_review", "changes_requested", "approved", "paid", "close_out"];

/**
 * A saved payee, shared by every committee that pays them, so the address and
 * W-9 are collected once. Social & Welfare payees are `restricted`: a separate
 * record only S&W and finance ever see (rules in lib/purchases/vendors.ts).
 */
export type Vendor = {
  id: string;
  name: string;
  w9OnFile: boolean;
  /** When finance confirmed the W-9 (the file itself lives only in the restricted W-9 drive). */
  w9Date?: string;
  /** The W-9 in the restricted drive. Finance only; never shown to requesters or put in a notice. */
  w9FileId?: string;
  /** Aid recipient or other Social & Welfare payee. Unset on records saved before this existed: treat as false. */
  restricted?: boolean;
  /** Mailing address from the latest check. */
  address?: string;
  /** Email or phone, typed by finance. */
  contact?: string;
  /** Funds that have paid this vendor. */
  funds?: string[];
  lastPaidAt?: string;
  timesPaid?: number;
};

export class ConflictError extends Error {
  constructor() {
    super("Someone else changed this request a moment ago. Reload and try again.");
  }
}

export interface CardStore {
  listByOwner(email: string): Promise<Card[]>;
  get(id: string): Promise<Card | null>;
  /** Purchase cards that aren't closed, plus done ones still waiting on a refund or repayment. */
  listOpenPurchases(): Promise<Card[]>;
  /** Purchase cards created since an ISO time, any status (for the card receipts checklist). */
  listPurchasesSince(iso: string): Promise<Card[]>;
  /** Purchase cards linked to an event card (purchase.eventCardId), any status. */
  listPurchasesForEvent(eventId: string): Promise<Card[]>;
  /** Marketing pieces linked to an event card (marketing.eventCardId), any status. */
  listMarketingForEvent(eventId: string): Promise<Card[]>;
  /** An event's A/V tickets (ticket.eventCardId), any status. */
  listTicketsForEvent(eventId: string): Promise<Card[]>;
  /** Card receipts (purchase.kind "card"), any status. About 8 a month. */
  listCardReceipts(): Promise<Card[]>;
  /** The most recently updated cards of any type (for search). */
  listRecent(limit: number): Promise<Card[]>;
  /** Cards of one type in any of these statuses (default: the open ones), for queues and lists. */
  listByType(type: CardType, statuses?: CardStatus[], limit?: number): Promise<Card[]>;
  /** Assigns the next ID with the given prefix ("PO") and saves. */
  create(card: Omit<Card, "id">, prefix: string): Promise<Card>;
  /** Saves only if nobody else saved since `expectedUpdatedAt`. */
  save(card: Card, expectedUpdatedAt: string): Promise<void>;
  /** Deletes a request for good (portal admins only, see lib/card-delete.ts). */
  remove(id: string): Promise<void>;
  listVendors(): Promise<Vendor[]>;
  saveVendor(v: Vendor): Promise<void>;
  deleteVendor(id: string): Promise<void>;
}

/** Purchase cards worth listing in queues: open, or done with money still owed back. */
function isOpenPurchase(c: Card): boolean {
  if (c.type !== "purchase") return false;
  if (OPEN_STATUSES.includes(c.status)) return true;
  return c.status === "closed" && Boolean(c.purchase?.lines.some((l) => l.flag && !l.resolvedAt));
}

// ---- Development: sample cards in memory -------------------------------

type MemoryState = { cards: Map<string, Card>; vendors: Map<string, Vendor>; next: Record<string, number>; seeded: boolean };

// Kept on globalThis so dev-server reloads don't wipe what you've submitted.
const g = globalThis as unknown as { __iarMemory?: MemoryState };
const mem: MemoryState = (g.__iarMemory ??= { cards: new Map(), vendors: new Map(), next: { ...COUNTER_START }, seeded: false });

// One shared promise, so pages that load several lists at once all wait for the same seeding.
let seeding: Promise<void> | null = null;
async function ensureSeeded() {
  if (mem.seeded) return;
  seeding ??= seed().then(() => {
    mem.seeded = true;
  });
  return seeding;
}

async function seed() {
  const [purchases, events, marketing, tickets] = await Promise.all([import("./purchases/samples"), import("./events/samples"), import("./marketing/samples"), import("./tickets/samples")]);
  for (const v of purchases.sampleVendors()) mem.vendors.set(v.id, v);
  const cards = [...(await purchases.samplePurchases()), ...(await events.sampleEvents()), ...marketing.sampleMarketing(), ...tickets.sampleTickets()];
  // Event samples include a purchase linked to an event, so each ID counts under its own prefix.
  for (const c of cards) {
    mem.cards.set(c.id, c);
    const [prefix, num] = c.id.split("-");
    if (Number(num) >= (mem.next[prefix] ?? 0)) mem.next[prefix] = Number(num) + 1;
  }
}

const clone = <T,>(x: T): T => structuredClone(x);

const memoryStore: CardStore = {
  async listByOwner(email) {
    await ensureSeeded();
    const own = [...mem.cards.values()].filter((c) => c.ownerEmail.toLowerCase() === email.toLowerCase());
    return own.map(clone).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id) {
    await ensureSeeded();
    const c = mem.cards.get(id);
    return c ? clone(c) : null;
  },
  async listOpenPurchases() {
    await ensureSeeded();
    return [...mem.cards.values()].filter(isOpenPurchase).map(clone);
  },
  async listPurchasesSince(iso) {
    await ensureSeeded();
    return [...mem.cards.values()].filter((c) => c.type === "purchase" && (c.createdAt ?? c.updatedAt) >= iso).map(clone);
  },
  async listPurchasesForEvent(eventId) {
    await ensureSeeded();
    return [...mem.cards.values()].filter((c) => c.type === "purchase" && c.purchase?.eventCardId === eventId).map(clone);
  },
  async listMarketingForEvent(eventId) {
    await ensureSeeded();
    return [...mem.cards.values()].filter((c) => c.type === "marketing" && c.marketing?.eventCardId === eventId).map(clone);
  },
  async listTicketsForEvent(eventId) {
    await ensureSeeded();
    return [...mem.cards.values()].filter((c) => c.type === "ticket" && c.ticket?.eventCardId === eventId).map(clone);
  },
  async listCardReceipts() {
    await ensureSeeded();
    return [...mem.cards.values()].filter((c) => c.type === "purchase" && c.purchase?.kind === "card").map(clone);
  },
  async listRecent(limit) {
    await ensureSeeded();
    return [...mem.cards.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit).map(clone);
  },
  async listByType(type, statuses = OPEN_STATUSES, limit = LIST_LIMIT) {
    await ensureSeeded();
    return [...mem.cards.values()]
      .filter((c) => c.type === type && statuses.includes(c.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(clone);
  },
  async create(card, prefix) {
    await ensureSeeded();
    const n = mem.next[prefix] ?? COUNTER_START[prefix] ?? 1001;
    mem.next[prefix] = n + 1;
    const saved = { ...clone(card), id: `${prefix}-${n}` } as Card;
    mem.cards.set(saved.id, saved);
    return clone(saved);
  },
  async save(card, expectedUpdatedAt) {
    await ensureSeeded();
    const cur = mem.cards.get(card.id);
    if (!cur || cur.updatedAt !== expectedUpdatedAt) throw new ConflictError();
    mem.cards.set(card.id, clone(card));
  },
  async remove(id) {
    await ensureSeeded();
    mem.cards.delete(id);
  },
  async listVendors() {
    await ensureSeeded();
    return [...mem.vendors.values()].map(clone).sort((a, b) => a.name.localeCompare(b.name));
  },
  async saveVendor(v) {
    await ensureSeeded();
    mem.vendors.set(v.id, clone(v));
  },
  async deleteVendor(id) {
    await ensureSeeded();
    mem.vendors.delete(id);
  },
};

// ---- Production: Firestore ---------------------------------------------
// Cards live at orgs/{orgId}/cards/{cardId}; vendors at orgs/{orgId}/vendors;
// ID counters at orgs/{orgId}/counters/{prefix}. Indexes: see docs/setup.md.

let firestoreStore: CardStore | null = null;

async function getFirestoreStore(): Promise<CardStore> {
  if (firestoreStore) return firestoreStore;
  const { db, org } = await firestore();
  const cards = org.collection("cards");
  const vendors = org.collection("vendors");
  const toCard = (d: { id: string; data(): unknown }) => ({ id: d.id, ...(d.data() as Omit<Card, "id">) });

  firestoreStore = {
    async listByOwner(email) {
      const snap = await cards
        .where("ownerEmail", "==", email.toLowerCase())
        .orderBy("updatedAt", "desc")
        .limit(100)
        .get();
      return snap.docs.map(toCard);
    },
    async get(id) {
      const d = await cards.doc(id).get();
      return d.exists ? toCard(d) : null;
    },
    async listOpenPurchases() {
      const [open, done] = await Promise.all([
        cards.where("type", "==", "purchase").where("status", "in", OPEN_STATUSES).limit(500).get(),
        cards.where("type", "==", "purchase").where("status", "==", "closed").where("purchase.hasOpenReturns", "==", true).limit(200).get(),
      ]);
      return [...open.docs, ...done.docs].map(toCard).filter(isOpenPurchase);
    },
    async listPurchasesSince(iso) {
      const snap = await cards.where("type", "==", "purchase").where("createdAt", ">=", iso).limit(1000).get();
      return snap.docs.map(toCard);
    },
    async listPurchasesForEvent(eventId) {
      // Equality on two fields: served by Firestore's single-field indexes, no composite index needed.
      const snap = await cards.where("type", "==", "purchase").where("purchase.eventCardId", "==", eventId).limit(200).get();
      return snap.docs.map(toCard);
    },
    async listMarketingForEvent(eventId) {
      // Equality on two fields, like payments for an event: no composite index.
      const snap = await cards.where("type", "==", "marketing").where("marketing.eventCardId", "==", eventId).limit(200).get();
      return snap.docs.map(toCard);
    },
    async listTicketsForEvent(eventId) {
      // Equality on two fields, like payments for an event: no composite index.
      const snap = await cards.where("type", "==", "ticket").where("ticket.eventCardId", "==", eventId).limit(200).get();
      return snap.docs.map(toCard);
    },
    async listCardReceipts() {
      // Equality on two fields again: no composite index. Ten years of card receipts fit.
      const snap = await cards.where("type", "==", "purchase").where("purchase.kind", "==", "card").limit(1000).get();
      return snap.docs.map(toCard);
    },
    async listRecent(limit) {
      const snap = await cards.orderBy("updatedAt", "desc").limit(limit).get();
      return snap.docs.map(toCard);
    },
    async listByType(type, statuses = OPEN_STATUSES, limit = LIST_LIMIT) {
      // No orderBy (that needs a composite index), so a full page means some were left out: say so in the logs.
      const snap = await cards.where("type", "==", type).where("status", "in", statuses.slice(0, 30)).limit(limit).get();
      if (snap.size >= limit) console.warn(`listByType(${type}) hit its limit of ${limit}; some requests aren't listed.`);
      return snap.docs.map(toCard).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async create(card, prefix) {
      const counter = org.collection("counters").doc(prefix);
      const start = COUNTER_START[prefix] ?? 1001;
      return db.runTransaction(async (tx) => {
        const c = await tx.get(counter);
        const n = (c.exists ? (c.data()?.next as number) : start) ?? start;
        const id = `${prefix}-${n}`;
        const saved = { ...card, id, ownerEmail: card.ownerEmail.toLowerCase() } as Card;
        tx.set(counter, { next: n + 1 });
        tx.create(cards.doc(id), clean(withIndexFields(saved)));
        return saved;
      });
    },
    async save(card, expectedUpdatedAt) {
      const ref = cards.doc(card.id);
      await db.runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        if (!cur.exists || cur.data()?.updatedAt !== expectedUpdatedAt) throw new ConflictError();
        tx.set(ref, clean(withIndexFields(card)));
      });
    },
    async remove(id) {
      await cards.doc(id).delete();
    },
    async listVendors() {
      const snap = await vendors.orderBy("name").limit(2000).get();
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Vendor, "id">) }));
    },
    async saveVendor(v) {
      await vendors.doc(v.id).set(clean(v));
    },
    async deleteVendor(id) {
      await vendors.doc(id).delete();
    },
  };
  return firestoreStore;
}

/** Denormalized flags Firestore can query on. */
function withIndexFields(card: Card): Card {
  if (!card.purchase) return card;
  const hasOpenReturns = card.purchase.lines.some((l) => l.flag && !l.resolvedAt);
  return { ...card, purchase: { ...card.purchase, hasOpenReturns } };
}

export async function cardStore(): Promise<CardStore> {
  if (isDevAuth()) return memoryStore;
  const store = await getFirestoreStore();
  // An admin signed in as someone: what they save says so (lib/act-as.ts). Outside a request (the daily jobs) there's no one signed in.
  const { currentActAs } = await import("./viewer");
  const as = await currentActAs().catch(() => null);
  return as ? onBehalfStore(store, as) : store;
}

/** The store, marking each request saved as done by the admin on the person's behalf, and noting it in the audit log. */
function onBehalfStore(store: CardStore, as: ActAs): CardStore {
  const note = (action: string) => audit({ admin: as.admin, target: as.target, action });
  return {
    ...store,
    async create(card, prefix) {
      const saved = await store.create(tagOnBehalf(null, card as Card, as), prefix);
      await note(`Created ${saved.id}`);
      return saved;
    },
    async save(card, expectedUpdatedAt) {
      await store.save(tagOnBehalf(await store.get(card.id), card, as), expectedUpdatedAt);
      await note(`Saved ${card.id}`);
    },
    async saveVendor(v) {
      await store.saveVendor(v);
      await note(`Saved vendor ${v.name}`);
    },
    async deleteVendor(id) {
      await store.deleteVendor(id);
      await note(`Removed vendor ${id}`);
    },
    async remove(id) {
      await store.remove(id);
      await note(`Deleted ${id}`);
    },
  };
}
