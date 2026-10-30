import "server-only";
import { type Away, coveringFor } from "./away";
import { clean, firestore } from "./db";
import { isDevAuth } from "./dev";
import type { Alert } from "./alerts";
import { cleanPrefs, type NotifyPrefs } from "./notify-prefs";
import { type PurchaseContext, personFunds, purchaseContext } from "./purchases/settings";
import type { Actor } from "./workflow-core";
import type { Viewer } from "./viewer";
import { todayLocal } from "./dates";

/**
 * Per-person settings the portal keeps itself: out-of-office handoffs (at
 * orgs/{orgId}/away/{email}), notification choices (notifyPrefs/{email}) and
 * the alerts held overnight for people with quiet hours on (heldAlerts).
 */
export interface PeopleStore {
  getAway(email: string): Promise<Away | null>;
  setAway(a: Away): Promise<void>;
  clearAway(email: string): Promise<void>;
  /** Away records naming this person as the one covering (past ones included). */
  listAwayByDelegate(email: string): Promise<Away[]>;
  /** Their notification choices; the defaults when they've never changed them. */
  getPrefs(email: string): Promise<NotifyPrefs>;
  setPrefs(p: NotifyPrefs): Promise<void>;
  /** Everyone who chose the morning digest. */
  listDigestPeople(): Promise<string[]>;
  /** Keep an alert until `sendAt` (quiet overnight). */
  holdAlert(h: HeldAlert): Promise<void>;
  /** Held alerts due by `now`, removed as they're taken. */
  takeDueAlerts(now: string): Promise<HeldAlert[]>;
}

/** An alert waiting for the morning. */
export type HeldAlert = { alert: Alert; sendAt: string; heldAt: string };

const g = globalThis as unknown as { __iarAway?: Map<string, Away>; __iarPrefs?: Map<string, NotifyPrefs>; __iarHeld?: HeldAlert[] };
const mem: Map<string, Away> = (g.__iarAway ??= new Map());
const memPrefs: Map<string, NotifyPrefs> = (g.__iarPrefs ??= new Map());
const memHeld: HeldAlert[] = (g.__iarHeld ??= []);

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
  async getPrefs(email) {
    return cleanPrefs(email, memPrefs.get(email.toLowerCase()));
  },
  async setPrefs(p) {
    memPrefs.set(p.email, structuredClone(p));
  },
  async listDigestPeople() {
    return [...memPrefs.values()].filter((p) => p.fyi === "digest").map((p) => p.email);
  },
  async holdAlert(h) {
    memHeld.push(structuredClone(h));
  },
  async takeDueAlerts(now) {
    const due = memHeld.filter((h) => h.sendAt <= now);
    for (const h of due) memHeld.splice(memHeld.indexOf(h), 1);
    return due;
  },
};

let fsStore: PeopleStore | null = null;
async function getFirestoreStore(): Promise<PeopleStore> {
  if (fsStore) return fsStore;
  const { org } = await firestore();
  const away = org.collection("away");
  const prefs = org.collection("notifyPrefs");
  const held = org.collection("heldAlerts");
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
    async getPrefs(email) {
      const d = await prefs.doc(email.toLowerCase()).get();
      return cleanPrefs(email, d.exists ? (d.data() as Partial<NotifyPrefs>) : null);
    },
    async setPrefs(p) {
      await prefs.doc(p.email).set(clean(p));
    },
    async listDigestPeople() {
      const snap = await prefs.where("fyi", "==", "digest").limit(500).get();
      return snap.docs.map((d) => (d.data() as NotifyPrefs).email);
    },
    async holdAlert(h) {
      await held.add(clean(h));
    },
    async takeDueAlerts(now) {
      const snap = await held.where("sendAt", "<=", now).limit(500).get();
      if (snap.empty) return [];
      const batch = held.firestore.batch();
      for (const d of snap.docs) batch.delete(d.ref);
      await batch.commit();
      return snap.docs.map((d) => d.data() as HeldAlert);
    },
  };
  return fsStore;
}

export async function peopleStore(): Promise<PeopleStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}

/**
 * The person acting, for workflow checks: their own group roles (never the
 * admin expansion), whoever they're covering for today, and the funds they
 * chair, oversee and direct (from their teams in Google Groups).
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
  return actorWith(viewer, await purchaseContext(), covering);
}

/** The same, from the funds settings already loaded and without looking up who they cover for. */
export function actorWith(viewer: Viewer, ctx: PurchaseContext, covering: string[] = []): Actor {
  const email = viewer.email.toLowerCase();
  const f = personFunds(ctx, email);
  const leads = [...viewer.teams.filter((t) => t.role !== "member").map((t) => t.group), ...viewer.directs];
  return { email, name: viewer.name, roles: viewer.actingRoles, covering, oversees: f.oversees, directs: f.directs, chairs: f.chairs, leads: [...new Set(leads)] };
}
