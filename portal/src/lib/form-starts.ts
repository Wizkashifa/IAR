import "server-only";
import { firestore } from "./db";
import { isDevAuth } from "./dev";
import type { FormName, StartedCount } from "./measures";

/**
 * How many times someone started typing in each request form, per day, for
 * the portal measures (lib/measures.ts). Only the form's name, the day and a
 * count: no content and nobody's identity. Stored at
 * orgs/{orgId}/formStarts/{day}_{form}.
 */
interface FormStartStore {
  add(form: FormName, day: string): Promise<void>;
  since(day: string): Promise<StartedCount[]>;
}

const g = globalThis as unknown as { __iarFormStarts?: Map<string, StartedCount> };
const mem: Map<string, StartedCount> = (g.__iarFormStarts ??= new Map());

const memoryStore: FormStartStore = {
  async add(form, day) {
    const key = `${day}_${form}`;
    const cur = mem.get(key);
    mem.set(key, { day, form, count: (cur?.count ?? 0) + 1 });
  },
  async since(day) {
    return [...mem.values()].filter((x) => x.day >= day).map((x) => ({ ...x }));
  },
};

let fsStore: FormStartStore | null = null;
async function getFirestoreStore(): Promise<FormStartStore> {
  if (fsStore) return fsStore;
  const { org } = await firestore();
  const { FieldValue } = await import("@google-cloud/firestore");
  const col = org.collection("formStarts");
  fsStore = {
    async add(form, day) {
      await col.doc(`${day}_${form}`).set({ day, form, count: FieldValue.increment(1) }, { merge: true });
    },
    async since(day) {
      const snap = await col.where("day", ">=", day).get();
      return snap.docs.map((d) => d.data() as StartedCount);
    },
  };
  return fsStore;
}

export async function formStartStore(): Promise<FormStartStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}
