import "server-only";
import { isActive } from "./away";
import { clean, firestore } from "./db";
import { isDevAuth } from "./dev";
import { type Alert, type Delivery, alertEmail, chatMessage, fallbackFor, routeAlerts } from "./alerts";
import { ChatUnreachable, chatEnabled, postToSpace, sendDm } from "./chat";
import { mailEnabled, sendMail } from "./mail";
import { defaultPrefs, digestText, routeFyi, splitForQuietHours, type NotifyPrefs } from "./notify-prefs";
import { roleMailbox, type Role } from "./org";
import { peopleStore } from "./people";
import { type PortalSettings, portalSettings } from "./portal-settings";
import type { Notice } from "./notices";
import type { Viewer } from "./viewer";
import { todayLocal } from "./dates";

/**
 * In-portal notifications (the bell) and the alerts that go with them
 * (Google Chat, with email as the fallback; routing in lib/alerts.ts).
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
  /** Drops every notification about one request (when a portal admin deletes it). */
  removeForCard(cardId: string): Promise<void>;
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
  async removeForCard(cardId) {
    mem.items = mem.items.filter((n) => n.cardId !== cardId);
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
    async removeForCard(cardId) {
      // In batches of 400 until none are left.
      for (;;) {
        const snap = await col.where("cardId", "==", cardId).limit(400).get();
        if (snap.empty) return;
        const batch = db.batch();
        for (const d of snap.docs) batch.delete(d.ref);
        await batch.commit();
      }
    },
  };
  return fsStore;
}

async function store(): Promise<NotificationStore> {
  return isDevAuth() ? memoryStore : getFirestoreStore();
}

/** Drops the bell's notifications about a deleted request, so none link to a page that's gone. */
export async function removeNotificationsFor(cardId: string): Promise<void> {
  await (await store()).removeForCard(cardId);
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
const groupMailbox = (r: Role) => (r === "member" ? null : roleMailbox(r));
/** Email is the fallback when Chat can't reach someone. PORTAL_EMAIL_FALLBACK=off makes alerts Chat only. */
const emailFallback = () => mailEnabled() && process.env.PORTAL_EMAIL_FALLBACK !== "off";

/**
 * Deliver notices: write them to the bell, and send an alert (Google Chat,
 * or email when Chat can't reach someone) for the ones marked for it.
 * Approvals waiting on someone who's away also go to the person covering.
 * Updates that aren't waiting on someone go by Chat only if they chose
 * "Right away in Chat" (lib/notify-prefs.ts); otherwise the bell and, if they
 * chose it, the morning digest. Never throws, so a Chat, mail or database
 * hiccup can't undo the action that caused it; failures are logged.
 */
export async function deliver(notices: Notice[], by: string, now = new Date().toISOString()): Promise<void> {
  if (notices.length === 0) return;
  const actor = by.toLowerCase();
  const items: Omit<Notification, "id">[] = [];
  const alerts: Alert[] = [];
  const updates: Alert[] = [];
  const today = todayLocal();
  let people: Awaited<ReturnType<typeof peopleStore>> | null = null;

  try {
    for (const n of notices) {
      const alert = n.alert;
      const base = { cardId: n.cardId, href: n.href, at: now, by: actor, readBy: [] as string[] };
      if ("role" in n.to) {
        items.push({ ...base, to: `role:${n.to.role}`, text: n.text });
        if (alert) alerts.push({ to: `role:${n.to.role}`, text: n.text, href: n.href, cardId: n.cardId });
        continue;
      }
      const to = n.to.email.toLowerCase();
      items.push({ ...base, to, text: n.text });
      if (alert) alerts.push({ to, text: n.text, href: n.href, cardId: n.cardId });
      else if (to !== actor) updates.push({ to, text: n.text, href: n.href, cardId: n.cardId, fyi: true });
      if (n.delegable) {
        people ??= await peopleStore();
        const away = await people.getAway(to);
        if (away && isActive(away, today) && away.delegate !== actor) {
          const text = `Covering for ${away.name}: ${n.text}`;
          items.push({ ...base, to: away.delegate, text });
          if (alert) alerts.push({ to: away.delegate, text, href: n.href, cardId: n.cardId, cover: { name: away.name, until: away.until } });
        }
      }
    }
    await (await store()).add(items);
  } catch (err) {
    console.error("notification write failed", err);
  }
  await sendAlerts([...alerts, ...(await wantedUpdates(updates))], { now: new Date(now) });
}

/** The updates whose person chose "Right away in Chat". A lookup failure sends none: they're still on the bell. */
async function wantedUpdates(updates: Alert[]): Promise<Alert[]> {
  if (updates.length === 0) return [];
  try {
    const prefs = await prefsFor(updates.map((u) => u.to));
    return updates.filter((u) => routeFyi(prefs(u.to)) === "send");
  } catch (err) {
    console.error("notification settings lookup failed", err);
    return [];
  }
}

/** Each person's choices, looked up once each. */
async function prefsFor(emails: string[]): Promise<(email: string) => NotifyPrefs> {
  const people = await peopleStore();
  const unique = [...new Set(emails.filter((e) => e.includes("@")).map((e) => e.toLowerCase()))];
  const found = new Map((await Promise.all(unique.map((e) => people.getPrefs(e)))).map((p) => [p.email, p]));
  return (email) => found.get(email.toLowerCase()) ?? defaultPrefs(email);
}

export type SendOptions = {
  /** The time to judge quiet hours by. */
  now?: Date;
  /** false: send even overnight (the morning flush and the digests). */
  hold?: boolean;
};

/**
 * Send alerts by Chat, falling back to email. A message to someone with
 * quiet overnight on that would arrive between 9 PM and 7 AM is kept and
 * sent by the 7 AM daily job instead. Never throws.
 */
export async function sendAlerts(alerts: Alert[], o: SendOptions = {}): Promise<void> {
  if (alerts.length === 0) return;
  const chat = chatEnabled();
  if (!chat && !mailEnabled()) return;
  if (o.hold !== false) alerts = await holdOvernight(alerts, o.now ?? new Date());
  if (alerts.length === 0) return;
  let spaces: PortalSettings["chatSpaces"] = {};
  if (chat) spaces = (await portalSettings()).chatSpaces ?? {};
  const deliveries = routeAlerts(alerts, { chat, spaces, groupMailbox });
  await Promise.all(
    deliveries.map(async (d) => {
      try {
        await send(d);
      } catch (err) {
        const fb = emailFallback() ? fallbackFor(d, groupMailbox) : null;
        if (!(err instanceof ChatUnreachable)) console.error(`alert by ${d.via} failed`, err);
        if (!fb) return;
        try {
          await send(fb);
        } catch (err2) {
          console.error("alert email fallback failed", err2);
        }
      }
    }),
  );
}

/** Keep tonight's messages for people with quiet overnight on; return the rest. If the lookup fails, everything goes now. */
async function holdOvernight(alerts: Alert[], now: Date): Promise<Alert[]> {
  try {
    const { send: sendNow, hold } = splitForQuietHours(alerts, now, await prefsFor(alerts.map((a) => a.to)));
    if (hold.length) {
      const people = await peopleStore();
      for (const h of hold) await people.holdAlert({ alert: h.alert, sendAt: h.sendAt.toISOString(), heldAt: now.toISOString() });
    }
    return sendNow;
  } catch (err) {
    console.error("quiet hours check failed; sending now", err);
    return alerts;
  }
}

/** The daily job at 7 AM: send what was held overnight. */
export async function sendHeldAlerts(now = new Date()): Promise<number> {
  const due = await (await peopleStore()).takeDueAlerts(now.toISOString());
  await sendAlerts(
    due.map((h) => h.alert),
    { now, hold: false },
  );
  return due.length;
}

/** The daily job: one Chat message for each person who chose the morning digest, listing their unread updates since yesterday. */
export async function sendDigests(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const emails = await (await peopleStore()).listDigestPeople();
  const s = await store();
  const digests: Alert[] = [];
  for (const email of emails) {
    const listed = (await s.listFor([email], 50)).filter((n) => n.at >= since && n.by !== email && !n.readBy.includes(email));
    const text = digestText(listed);
    if (text) digests.push({ to: email, text, href: "/notifications", fyi: true });
  }
  await sendAlerts(digests, { now, hold: false });
  return digests.length;
}

async function send(d: Delivery): Promise<void> {
  const url = portalUrl(d.alert.href);
  if (d.via === "dm") return sendDm(d.email, chatMessage(d.alert, url));
  if (d.via === "space") return postToSpace(d.space, chatMessage(d.alert, url), d.alert.cardId);
  if (!mailEnabled()) return;
  const m = alertEmail(d.alert, url);
  return sendMail([d.to], m.subject, m.text);
}
