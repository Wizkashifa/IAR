import "server-only";
import { clean, firestore } from "../db";
import { isDevAuth } from "../dev";
import type { ReceiptUpload } from "./types";

/**
 * Card receipts uploaded one at a time while the cardholder fills in their
 * charges, at orgs/{orgId}/cardReceiptUploads/{id}. The file itself is in
 * the PO records Shared Drive; this record says whose it is, so a request
 * can only use its own sender's uploads. Dev keeps them in memory.
 */
export interface ReceiptUploadStore {
  save(u: ReceiptUpload): Promise<void>;
  /** The uploads with these ids that exist. */
  getMany(ids: string[]): Promise<ReceiptUpload[]>;
}

const g = globalThis as unknown as { __iarReceiptUploads?: Map<string, ReceiptUpload> };
const mem = (g.__iarReceiptUploads ??= new Map());

const memoryStore: ReceiptUploadStore = {
  async save(u) {
    mem.set(u.id, structuredClone(u));
  },
  async getMany(ids) {
    return ids.flatMap((id) => (mem.has(id) ? [structuredClone(mem.get(id)!)] : []));
  },
};

let fsStore: ReceiptUploadStore | null = null;
async function getFirestoreStore(): Promise<ReceiptUploadStore> {
  if (fsStore) return fsStore;
  const { org, db } = await firestore();
  const col = org.collection("cardReceiptUploads");
  fsStore = {
    async save(u) {
      await col.doc(u.id).set(clean(u));
    },
    async getMany(ids) {
      if (ids.length === 0) return [];
      const docs = await db.getAll(...ids.map((id) => col.doc(id)));
      return docs.filter((d) => d.exists).map((d) => d.data() as ReceiptUpload);
    },
  };
  return fsStore;
}

export async function receiptUploadStore(): Promise<ReceiptUploadStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}
