import "server-only";
import { clean, firestore } from "./db";
import { isDevAuth } from "./dev";
import { ORG } from "./org";
import type { PurchaseDetails } from "./purchases/types";

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
  createdAt?: string;
  /** Purchase Requests module fields (type "purchase"). */
  purchase?: PurchaseDetails;
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

/** Statuses a card can still move from. */
export const OPEN_STATUSES: CardStatus[] = ["submitted", "in_review", "changes_requested", "approved", "paid", "close_out"];

/** A saved payee, so a W-9 is collected once per vendor, not once per request. */
export type Vendor = {
  id: string;
  name: string;
  w9OnFile: boolean;
  /** When finance confirmed the W-9 (the file itself lives only in the restricted W-9 drive). */
  w9Date?: string;
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
  /** The most recently updated cards of any type (for search). */
  listRecent(limit: number): Promise<Card[]>;
  /** Assigns the next ID with the given prefix ("PO") and saves. */
  create(card: Omit<Card, "id">, prefix: string): Promise<Card>;
  /** Saves only if nobody else saved since `expectedUpdatedAt`. */
  save(card: Card, expectedUpdatedAt: string): Promise<void>;
  listVendors(): Promise<Vendor[]>;
  saveVendor(v: Vendor): Promise<void>;
}

export const vendorId = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unnamed";

/** Purchase cards worth listing in queues: open, or done with money still owed back. */
function isOpenPurchase(c: Card): boolean {
  if (c.type !== "purchase") return false;
  if (OPEN_STATUSES.includes(c.status)) return true;
  return c.status === "closed" && Boolean(c.purchase?.lines.some((l) => l.flag && !l.resolvedAt));
}

// ---- Development: sample cards in memory -------------------------------

/** Placeholder event cards, until the Events module exists. Shown to every sample user. */
function sampleEventCards(email: string): Card[] {
  const day = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
  const ahead = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
  const base = { orgId: ORG.id, ownerEmail: email };
  return [
    { ...base, id: "EV-1042", type: "event", title: "Youth Halaqa — winter series", status: "changes_requested", committee: "Youth", waitingOn: "You: pick a room without a school-hours conflict", eventDate: ahead(18), updatedAt: day(0) },
    { ...base, id: "EV-1031", type: "event", title: "Family Night", status: "approved", committee: "Youth", waitingOn: "Marketing: flyer due in 6 days", eventDate: ahead(9), updatedAt: day(3) },
    { ...base, id: "EV-0998", type: "event", title: "Community Iftar volunteer briefing", status: "close_out", committee: "Social & Welfare", waitingOn: "You: attendance and final costs", eventDate: ahead(-4), updatedAt: day(4) },
  ];
}

type MemoryState = { cards: Map<string, Card>; vendors: Map<string, Vendor>; next: Record<string, number>; seeded: boolean };

// Kept on globalThis so dev-server reloads don't wipe what you've submitted.
const g = globalThis as unknown as { __iarMemory?: MemoryState };
const mem: MemoryState = (g.__iarMemory ??= { cards: new Map(), vendors: new Map(), next: { PO: 12001 }, seeded: false });

async function ensureSeeded() {
  if (mem.seeded) return;
  mem.seeded = true;
  const { samplePurchases, sampleVendors } = await import("./purchases/samples");
  for (const c of await samplePurchases()) {
    mem.cards.set(c.id, c);
    const n = Number(c.id.split("-")[1]);
    if (n >= mem.next.PO) mem.next.PO = n + 1;
  }
  for (const v of sampleVendors()) mem.vendors.set(v.id, v);
}

const clone = <T,>(x: T): T => structuredClone(x);

const memoryStore: CardStore = {
  async listByOwner(email) {
    await ensureSeeded();
    const own = [...mem.cards.values()].filter((c) => c.ownerEmail.toLowerCase() === email.toLowerCase());
    return [...own.map(clone), ...sampleEventCards(email)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
  async listRecent(limit) {
    await ensureSeeded();
    return [...mem.cards.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit).map(clone);
  },
  async create(card, prefix) {
    await ensureSeeded();
    const n = mem.next[prefix] ?? 1;
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
  async listVendors() {
    await ensureSeeded();
    return [...mem.vendors.values()].map(clone).sort((a, b) => a.name.localeCompare(b.name));
  },
  async saveVendor(v) {
    await ensureSeeded();
    mem.vendors.set(v.id, clone(v));
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
    async listRecent(limit) {
      const snap = await cards.orderBy("updatedAt", "desc").limit(limit).get();
      return snap.docs.map(toCard);
    },
    async create(card, prefix) {
      const counter = org.collection("counters").doc(prefix);
      return db.runTransaction(async (tx) => {
        const c = await tx.get(counter);
        const n = (c.exists ? (c.data()?.next as number) : 12001) ?? 12001;
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
    async listVendors() {
      const snap = await vendors.orderBy("name").limit(2000).get();
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Vendor, "id">) }));
    },
    async saveVendor(v) {
      await vendors.doc(v.id).set(clean(v));
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
  return isDevAuth() ? memoryStore : getFirestoreStore();
}
