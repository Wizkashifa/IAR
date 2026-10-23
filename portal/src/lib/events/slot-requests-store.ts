import "server-only";
import { clean, firestore } from "../db";
import { isDevAuth } from "../dev";
import { ConflictError } from "../cards";
import type { SlotRequest } from "./slot-requests";

/**
 * Asks for a booked time slot (rules in slot-requests.ts). Stored at
 * orgs/{orgId}/slotRequests/{id}, with IDs from orgs/{orgId}/counters/SR.
 */
export interface SlotRequestStore {
  get(id: string): Promise<SlotRequest | null>;
  /** Every ask on one booking ("card:EV-1031" or "cal:<id>"), to check for clashes. */
  listForHold(holdKey: string): Promise<SlotRequest[]>;
  /** Asks a requester's card has made. */
  listFromCard(cardId: string): Promise<SlotRequest[]>;
  /** Open asks any of these addresses (emails or "role:x") may decide. */
  listWaitingOn(addresses: string[]): Promise<SlotRequest[]>;
  /** Open asks, for the daily reminder and escalation job. */
  listOpen(): Promise<SlotRequest[]>;
  create(req: Omit<SlotRequest, "id">): Promise<SlotRequest>;
  /** Saves only if nobody else saved since `expectedUpdatedAt`. */
  save(req: SlotRequest, expectedUpdatedAt: string): Promise<void>;
}

const OPEN = ["open", "escalated"];
const newestFirst = (a: SlotRequest, b: SlotRequest) => b.updatedAt.localeCompare(a.updatedAt);

const g = globalThis as unknown as { __iarSlots?: { items: Map<string, SlotRequest>; next: number } };
const mem = (g.__iarSlots ??= { items: new Map<string, SlotRequest>(), next: 1001 });
const all = () => [...mem.items.values()].map((r) => structuredClone(r)).sort(newestFirst);

const memoryStore: SlotRequestStore = {
  async get(id) {
    const r = mem.items.get(id);
    return r ? structuredClone(r) : null;
  },
  async listForHold(holdKey) {
    return all().filter((r) => r.holdKey === holdKey);
  },
  async listFromCard(cardId) {
    return all().filter((r) => r.fromCard === cardId);
  },
  async listWaitingOn(addresses) {
    return all().filter((r) => OPEN.includes(r.status) && r.deciders.some((a) => addresses.includes(a)));
  },
  async listOpen() {
    return all().filter((r) => OPEN.includes(r.status));
  },
  async create(req) {
    const saved = { ...structuredClone(req), id: `SR-${mem.next++}` };
    mem.items.set(saved.id, saved);
    return structuredClone(saved);
  },
  async save(req, expectedUpdatedAt) {
    const cur = mem.items.get(req.id);
    if (!cur || cur.updatedAt !== expectedUpdatedAt) throw new ConflictError();
    mem.items.set(req.id, structuredClone(req));
  },
};

let fsStore: SlotRequestStore | null = null;
async function getFirestoreStore(): Promise<SlotRequestStore> {
  if (fsStore) return fsStore;
  const { db, org } = await firestore();
  const col = org.collection("slotRequests");
  const toReq = (d: { id: string; data(): unknown }) => ({ id: d.id, ...(d.data() as Omit<SlotRequest, "id">) });
  fsStore = {
    async get(id) {
      const d = await col.doc(id).get();
      return d.exists ? toReq(d) : null;
    },
    async listForHold(holdKey) {
      const snap = await col.where("holdKey", "==", holdKey).limit(200).get();
      return snap.docs.map(toReq).sort(newestFirst);
    },
    async listFromCard(cardId) {
      const snap = await col.where("fromCard", "==", cardId).limit(100).get();
      return snap.docs.map(toReq).sort(newestFirst);
    },
    async listWaitingOn(addresses) {
      // Filter on status here: Firestore allows only one array-contains-any or in per query.
      const snap = await col.where("deciders", "array-contains-any", addresses.slice(0, 30)).limit(200).get();
      return snap.docs.map(toReq).filter((r) => OPEN.includes(r.status)).sort(newestFirst);
    },
    async listOpen() {
      const snap = await col.where("status", "in", OPEN).limit(500).get();
      return snap.docs.map(toReq).sort(newestFirst);
    },
    async create(req) {
      const counter = org.collection("counters").doc("SR");
      return db.runTransaction(async (tx) => {
        const c = await tx.get(counter);
        const n = (c.exists ? (c.data()?.next as number) : 1001) ?? 1001;
        const saved = { ...req, id: `SR-${n}` };
        tx.set(counter, { next: n + 1 });
        tx.create(col.doc(saved.id), clean(saved));
        return saved;
      });
    },
    async save(req, expectedUpdatedAt) {
      const ref = col.doc(req.id);
      await db.runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        if (!cur.exists || cur.data()?.updatedAt !== expectedUpdatedAt) throw new ConflictError();
        tx.set(ref, clean(req));
      });
    },
  };
  return fsStore;
}

export async function slotRequestStore(): Promise<SlotRequestStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}
