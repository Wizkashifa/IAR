import "server-only";
import { clean, firestore } from "../db";
import { isDevAuth } from "../dev";
import type { TicketSchedule } from "./schedules";

/**
 * Preventive maintenance schedules, at orgs/{orgId}/ticketSchedules/{id} in
 * production and in memory (with two samples) in dev mode. A few dozen at
 * most, so they're always read whole.
 */
export interface ScheduleStore {
  list(): Promise<TicketSchedule[]>;
  get(id: string): Promise<TicketSchedule | null>;
  /** Assigns an ID and saves. */
  create(s: Omit<TicketSchedule, "id">): Promise<TicketSchedule>;
  save(s: TicketSchedule): Promise<void>;
}

const byName = (a: TicketSchedule, b: TicketSchedule) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name);

type Mem = { items: Map<string, TicketSchedule>; seq: number; seeded: boolean };
const g = globalThis as unknown as { __iarTicketSchedules?: Mem };
const mem: Mem = (g.__iarTicketSchedules ??= { items: new Map(), seq: 0, seeded: false });

async function seed() {
  if (mem.seeded) return;
  mem.seeded = true;
  const { sampleSchedules } = await import("./samples");
  for (const s of sampleSchedules()) {
    mem.items.set(s.id, s);
    mem.seq = Math.max(mem.seq, Number(s.id.replace(/\D/g, "")) || 0);
  }
}

const memoryStore: ScheduleStore = {
  async list() {
    await seed();
    return [...mem.items.values()].map((s) => structuredClone(s)).sort(byName);
  },
  async get(id) {
    await seed();
    const s = mem.items.get(id);
    return s ? structuredClone(s) : null;
  },
  async create(s) {
    await seed();
    const saved = { ...structuredClone(s), id: `PM-${++mem.seq}` };
    mem.items.set(saved.id, saved);
    return structuredClone(saved);
  },
  async save(s) {
    await seed();
    mem.items.set(s.id, structuredClone(s));
  },
};

let fsStore: ScheduleStore | null = null;
async function getFirestoreStore(): Promise<ScheduleStore> {
  if (fsStore) return fsStore;
  const { org } = await firestore();
  const col = org.collection("ticketSchedules");
  const to = (d: { id: string; data(): unknown }) => ({ ...(d.data() as Omit<TicketSchedule, "id">), id: d.id });
  fsStore = {
    async list() {
      const snap = await col.limit(500).get();
      return snap.docs.map(to).sort(byName);
    },
    async get(id) {
      const d = await col.doc(id).get();
      return d.exists ? to(d) : null;
    },
    async create(s) {
      const ref = col.doc();
      const saved = { ...s, id: ref.id };
      await ref.set(clean(s));
      return saved;
    },
    async save(s) {
      const { id, ...rest } = s;
      await col.doc(id).set(clean(rest));
    },
  };
  return fsStore;
}

export async function scheduleStore(): Promise<ScheduleStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}
