import "server-only";
import type { Comment } from "./comments";
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
  /** Replies between the portal admins and the person who sent it (lib/feedback-thread.ts). */
  replies?: Comment[];
};

interface FeedbackStore {
  add(f: Omit<Feedback, "id">): Promise<Feedback>;
  list(limit: number): Promise<Feedback[]>;
  /** What one person sent, newest first. */
  listBy(email: string, limit: number): Promise<Feedback[]>;
  get(id: string): Promise<Feedback | null>;
  setStatus(id: string, status: Feedback["status"], by: string): Promise<void>;
  /** Adds a reply; `reopen` puts done feedback back to open (the sender wrote again). */
  addReply(id: string, reply: Comment, reopen: boolean): Promise<void>;
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
  async listBy(email, limit) {
    return mem.items.filter((f) => f.by === email.toLowerCase()).slice(0, limit).map((f) => structuredClone(f));
  },
  async get(id) {
    const f = mem.items.find((x) => x.id === id);
    return f ? structuredClone(f) : null;
  },
  async setStatus(id, status, by) {
    const f = mem.items.find((x) => x.id === id);
    if (f) Object.assign(f, { status, doneBy: status === "done" ? by : undefined });
  },
  async addReply(id, reply, reopen) {
    const f = mem.items.find((x) => x.id === id);
    if (!f) return;
    f.replies = [...(f.replies ?? []), structuredClone(reply)];
    if (reopen) Object.assign(f, { status: "new", doneBy: undefined });
  },
};

let fsStore: FeedbackStore | null = null;
async function getFirestoreStore(): Promise<FeedbackStore> {
  if (fsStore) return fsStore;
  const { org } = await firestore();
  const { FieldValue } = await import("@google-cloud/firestore");
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
    async listBy(email, limit) {
      // Equality only, sorted here: no composite index needed. One person's feedback is a short list.
      const snap = await col.where("by", "==", email.toLowerCase()).get();
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Feedback, "id">) }))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit);
    },
    async get(id) {
      const d = await col.doc(id).get();
      return d.exists ? { id: d.id, ...(d.data() as Omit<Feedback, "id">) } : null;
    },
    async setStatus(id, status, by) {
      await col.doc(id).update(status === "done" ? { status, doneBy: by } : { status });
    },
    async addReply(id, reply, reopen) {
      await col.doc(id).update({ replies: FieldValue.arrayUnion(clean(reply)), ...(reopen ? { status: "new", doneBy: FieldValue.delete() } : {}) });
    },
  };
  return fsStore;
}

export async function feedbackStore(): Promise<FeedbackStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}
