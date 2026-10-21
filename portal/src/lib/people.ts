import "server-only";
import { type Away, coveringFor, todayLocal } from "./away";
import { clean, firestore } from "./db";
import { isDevAuth } from "./dev";
import type { Actor } from "./purchases/workflow";
import type { Viewer } from "./viewer";

/**
 * Per-person settings the portal keeps itself. Today: out-of-office handoffs,
 * at orgs/{orgId}/away/{email}.
 */
export interface PeopleStore {
  getAway(email: string): Promise<Away | null>;
  setAway(a: Away): Promise<void>;
  clearAway(email: string): Promise<void>;
  /** Away records naming this person as the one covering (past ones included). */
  listAwayByDelegate(email: string): Promise<Away[]>;
}

const g = globalThis as unknown as { __iarAway?: Map<string, Away> };
const mem: Map<string, Away> = (g.__iarAway ??= new Map());

const memoryStore: PeopleStore = {
  async getAway(email) {
    return mem.get(email.toLowerCase()) ?? null;
  },
  async setAway(a) {
    mem.set(a.email, structuredClone(a));
  },
  async clearAway(email) {
    mem.delete(email.toLowerCase());
  },
  async listAwayByDelegate(email) {
    return [...mem.values()].filter((a) => a.delegate === email.toLowerCase()).map((a) => structuredClone(a));
  },
};

let fsStore: PeopleStore | null = null;
async function getFirestoreStore(): Promise<PeopleStore> {
  if (fsStore) return fsStore;
  const { org } = await firestore();
  const away = org.collection("away");
  fsStore = {
    async getAway(email) {
      const d = await away.doc(email.toLowerCase()).get();
      return d.exists ? (d.data() as Away) : null;
    },
    async setAway(a) {
      await away.doc(a.email).set(clean(a));
    },
    async clearAway(email) {
      await away.doc(email.toLowerCase()).delete();
    },
    async listAwayByDelegate(email) {
      const snap = await away.where("delegate", "==", email.toLowerCase()).limit(50).get();
      return snap.docs.map((d) => d.data() as Away);
    },
  };
  return fsStore;
}

export async function peopleStore(): Promise<PeopleStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}

/**
 * The person acting, for workflow checks: their own group roles (never the
 * admin expansion) plus whoever they're covering for today.
 */
export async function actorFor(viewer: Viewer): Promise<Actor> {
  const email = viewer.email.toLowerCase();
  let covering: string[] = [];
  try {
    covering = coveringFor(await (await peopleStore()).listAwayByDelegate(email), email, todayLocal());
  } catch (err) {
    // Covering is a convenience; a lookup failure must not lock anyone out of their own approvals.
    console.error("away lookup failed", err);
  }
  return { email, name: viewer.name, roles: viewer.actingRoles, covering };
}
