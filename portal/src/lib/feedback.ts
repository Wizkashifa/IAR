import "server-only";
import { clean, firestore } from "./db";
import { isDevAuth } from "./dev";
import type { FeedbackKind } from "./feedback-kinds";

export { FEEDBACK_KIND_LABEL, type FeedbackKind } from "./feedback-kinds";

/**
 * Beta feedback: problems, ideas and questions about the portal itself, sent
 * from any page. Goes to portal admins, not to a team queue (facilities and
 * IT work their own requests elsewhere). Stored at orgs/{orgId}/feedback.
 */
export type Feedback = {
  id: string;
  at: string;
  by: string;
  name: string;
  kind: FeedbackKind;
  message: string;
  /** The portal page they were on. */
  page: string;
  userAgent?: string;
  status: "new" | "done";
  doneBy?: string;
};

interface FeedbackStore {
  add(f: Omit<Feedback, "id">): Promise<Feedback>;
  list(limit: number): Promise<Feedback[]>;
  setStatus(id: string, status: Feedback["status"], by: string): Promise<void>;
}

const g = globalThis as unknown as { __iarFeedback?: { items: Feedback[]; seq: number } };
const mem = (g.__iarFeedback ??= { items: [], seq: 0 });

const memoryStore: FeedbackStore = {
  async add(f) {
    const saved = { ...structuredClone(f), id: `FB-${++mem.seq}` };
    mem.items.unshift(saved);
    return structuredClone(saved);
  },
  async list(limit) {
    return mem.items.slice(0, limit).map((f) => structuredClone(f));
  },
  async setStatus(id, status, by) {
    const f = mem.items.find((x) => x.id === id);
    if (f) Object.assign(f, { status, doneBy: status === "done" ? by : undefined });
  },
};

let fsStore: FeedbackStore | null = null;
async function getFirestoreStore(): Promise<FeedbackStore> {
  if (fsStore) return fsStore;
  const { org } = await firestore();
  const col = org.collection("feedback");
  fsStore = {
    async add(f) {
      const ref = col.doc();
      await ref.set(clean(f));
      return { ...f, id: ref.id };
    },
    async list(limit) {
      const snap = await col.orderBy("at", "desc").limit(limit).get();
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Feedback, "id">) }));
    },
    async setStatus(id, status, by) {
      await col.doc(id).update(status === "done" ? { status, doneBy: by } : { status });
    },
  };
  return fsStore;
}

export async function feedbackStore(): Promise<FeedbackStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}
