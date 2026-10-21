import "server-only";
import { isActive, todayLocal } from "./away";
import { clean, firestore } from "./db";
import { isDevAuth } from "./dev";
import { mailEnabled, sendMail } from "./mail";
import { ORG, type Role } from "./org";
import { peopleStore } from "./people";
import type { Notice } from "./purchases/notices";
import type { Viewer } from "./viewer";

/**
 * In-portal notifications (the bell) and the emails that go with them.
 *
 * A notification is addressed to one person ("someone@islam1.org") or to a
 * role ("role:finance"), so a finance-queue item reaches whoever in finance
 * looks first. Each person's read state is kept on the notification
 * (`readBy`). Stored at orgs/{orgId}/notifications; index in docs/setup.md.
 */
export type Notification = {
  id: string;
  /** An email, or "role:<role>". */
  to: string;
  cardId?: string;
  href: string;
  text: string;
  at: string;
  /** Who caused it; they don't see it themselves. */
  by: string;
  readBy: string[];
};

interface NotificationStore {
  add(items: Omit<Notification, "id">[]): Promise<void>;
  /** Newest first, for any of these addresses. */
  listFor(to: string[], limit: number): Promise<Notification[]>;
  markRead(ids: string[], email: string): Promise<void>;
}

const g = globalThis as unknown as { __iarNotifs?: { items: Notification[]; seq: number } };
const mem = (g.__iarNotifs ??= { items: [], seq: 0 });

const memoryStore: NotificationStore = {
  async add(items) {
    for (const n of items) mem.items.unshift({ ...structuredClone(n), id: String(++mem.seq) });
  },
  async listFor(to, limit) {
    return mem.items.filter((n) => to.includes(n.to)).slice(0, limit).map((n) => structuredClone(n));
  },
  async markRead(ids, email) {
    for (const n of mem.items) if (ids.includes(n.id) && !n.readBy.includes(email)) n.readBy.push(email);
  },
};

let fsStore: NotificationStore | null = null;
async function getFirestoreStore(): Promise<NotificationStore> {
  if (fsStore) return fsStore;
  const { db, org } = await firestore();
  const { FieldValue } = await import("@google-cloud/firestore");
  const col = org.collection("notifications");
  fsStore = {
    async add(items) {
      const batch = db.batch();
      for (const n of items) batch.set(col.doc(), clean(n));
      await batch.commit();
    },
    async listFor(to, limit) {
      const snap = await col.where("to", "in", to.slice(0, 30)).orderBy("at", "desc").limit(limit).get();
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Notification, "id">) }));
    },
    async markRead(ids, email) {
      const batch = db.batch();
      for (const id of ids.slice(0, 400)) batch.update(col.doc(id), { readBy: FieldValue.arrayUnion(email) });
      await batch.commit();
    },
  };
  return fsStore;
}

async function store(): Promise<NotificationStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}

/** The addresses a person's notifications can come to: their email and their own groups' roles. */
export function addressesOf(viewer: Viewer): string[] {
  return [viewer.email.toLowerCase(), ...viewer.actingRoles.filter((r) => r !== "member").map((r) => `role:${r}`)];
}

const visibleTo = (n: Notification, email: string) => n.by !== email;
const unread = (n: Notification, email: string) => !n.readBy.includes(email);

export async function listNotifications(viewer: Viewer, limit = 50): Promise<(Notification & { unread: boolean })[]> {
  const email = viewer.email.toLowerCase();
  const items = await (await store()).listFor(addressesOf(viewer), limit);
  return items.filter((n) => visibleTo(n, email)).map((n) => ({ ...n, unread: unread(n, email) }));
}

/** For the header bell. Never throws: a failed count shows as zero. */
export async function unreadCount(viewer: Viewer): Promise<number> {
  try {
    return (await listNotifications(viewer, 50)).filter((n) => n.unread).length;
  } catch (err) {
    console.error("notification count failed", err);
    return 0;
  }
}

export async function markRead(viewer: Viewer, ids: string[] | "all"): Promise<void> {
  const email = viewer.email.toLowerCase();
  const list = ids === "all" ? (await listNotifications(viewer, 200)).filter((n) => n.unread).map((n) => n.id) : ids;
  if (list.length) await (await store()).markRead(list, email);
}

const portalUrl = (href: string) => `${(process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "")}${href}`;
const roleGroup = (r: Role) => (r === "member" ? null : ORG.roleGroups[r]);

/**
 * Deliver notices: write them to the bell and email the ones marked for it.
 * Approvals waiting on someone who's away also go to the person covering.
 * Never throws, so a mail or database hiccup can't undo the action that
 * caused it; failures are logged.
 */
export async function deliver(notices: Notice[], by: string, now = new Date().toISOString()): Promise<void> {
  if (notices.length === 0) return;
  const actor = by.toLowerCase();
  const items: Omit<Notification, "id">[] = [];
  const mails: { to: string; subject: string; text: string; href: string }[] = [];
  const today = todayLocal();
  let people: Awaited<ReturnType<typeof peopleStore>> | null = null;

  try {
    for (const n of notices) {
      const base = { cardId: n.cardId, href: n.href, at: now, by: actor, readBy: [] as string[] };
      if ("role" in n.to) {
        items.push({ ...base, to: `role:${n.to.role}`, text: n.text });
        const group = roleGroup(n.to.role);
        if (n.email && group) mails.push({ to: group, subject: n.text, text: n.text, href: n.href });
        continue;
      }
      const to = n.to.email.toLowerCase();
      items.push({ ...base, to, text: n.text });
      if (n.email) mails.push({ to, subject: n.text, text: n.text, href: n.href });
      if (n.delegable) {
        people ??= await peopleStore();
        const away = await people.getAway(to);
        if (away && isActive(away, today) && away.delegate !== actor) {
          const text = `Covering for ${away.name}: ${n.text}`;
          items.push({ ...base, to: away.delegate, text });
          if (n.email) mails.push({ to: away.delegate, subject: text, text: `${text}\n\n${away.name} is away until ${away.until} and asked you to cover their approvals.`, href: n.href });
        }
      }
    }
    await (await store()).add(items);
  } catch (err) {
    console.error("notification write failed", err);
  }

  if (!mailEnabled()) return;
  await Promise.all(
    mails.map(async (m) => {
      try {
        await sendMail([m.to], m.subject, `${m.text}\n\nOpen it in the IAR Portal: ${portalUrl(m.href)}\n\nYou're getting this because it's waiting on you. Everything else stays in the portal's notifications.`);
      } catch (err) {
        console.error("notification email failed", err);
      }
    }),
  );
}
