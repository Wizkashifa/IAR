import "server-only";
import { clean, firestore } from "./db";
import { isDevAuth } from "./dev";

/**
 * What portal admins did while signed in as someone else: when they started
 * and stopped, and each request they saved meanwhile. Kept so anyone can
 * check later. Stored at orgs/{orgId}/audit, and written to the Cloud Run
 * log too.
 */
export type AuditEntry = {
  at: string;
  /** The admin. */
  admin: string;
  /** Who they were signed in as. */
  target: string;
  /** "Started signing in as", "Stopped", "Saved PO-12001", a page they sent a form from. */
  action: string;
};

interface AuditStore {
  add(e: AuditEntry): Promise<void>;
  list(limit: number): Promise<AuditEntry[]>;
}

const g = globalThis as unknown as { __iarAudit?: AuditEntry[] };
const mem = (g.__iarAudit ??= []);

const memoryStore: AuditStore = {
  async add(e) {
    mem.unshift(structuredClone(e));
  },
  async list(limit) {
    return mem.slice(0, limit).map((e) => structuredClone(e));
  },
};

let fsStore: AuditStore | null = null;
async function getFirestoreStore(): Promise<AuditStore> {
  if (fsStore) return fsStore;
  const { org } = await firestore();
  const col = org.collection("audit");
  fsStore = {
    async add(e) {
      await col.add(clean(e));
    },
    async list(limit) {
      const snap = await col.orderBy("at", "desc").limit(limit).get();
      return snap.docs.map((d) => d.data() as AuditEntry);
    },
  };
  return fsStore;
}

export async function auditStore(): Promise<AuditStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}

/** Records it, and logs it. A failure is logged and never stops what the admin was doing. */
export async function audit(e: Omit<AuditEntry, "at">): Promise<void> {
  const entry = { ...e, at: new Date().toISOString() };
  console.info(JSON.stringify({ audit: entry }));
  try {
    await (await auditStore()).add(entry);
  } catch (err) {
    console.error("audit write failed", err);
  }
}
