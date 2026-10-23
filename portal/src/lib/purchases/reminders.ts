/**
 * What the daily job does about purchase requests (plan: "morning digest,
 * overdue escalation"). Plain functions so they can be tested; daily.ts
 * loads the requests, calls these, saves and delivers.
 *
 * - A request waiting REMINDER_DAYS at a step: one reminder to whoever it's
 *   waiting on (an alert).
 * - Still waiting ESCALATE_DAYS at the chair step: the committee's director
 *   hears (an alert), or the finance office when there's no director.
 * - Every weekday morning: one digest per chair approver listing what waits
 *   on them, and one for the finance office's queue. Weekends are quiet.
 * Each reminder and escalation happens once per step; sending a request
 * back or moving it on starts the count again.
 */
import type { Notice, Recipient } from "./notices";
import { STAGE_LABEL, purchaseTotal } from "./types";
import { ESCALATE_DAYS, REMINDER_DAYS, type PurchaseCard, daysWaiting } from "./workflow";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const label = (c: PurchaseCard) => (c.purchase.restricted ? `${c.id} (Social & Welfare request)` : `${c.id} “${c.title}” (${money(purchaseTotal(c.purchase))})`);
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** Who a request at its current step is waiting on. Null when nobody has to act. */
export function waitingOn(c: PurchaseCard): Recipient | null {
  if (c.status !== "in_review" && c.status !== "approved" && c.status !== "paid") return null;
  switch (c.purchase.stage) {
    case "chair":
      return c.purchase.approverEmail ? { email: c.purchase.approverEmail } : null;
    case "finance":
    case "payment":
      return { role: "finance" };
    case "executive":
      return { role: "executive" };
    default:
      // QuickBooks entry is batch work; no reminders for it.
      return null;
  }
}

export type FollowUp = { card: PurchaseCard; kind: "remind" | "escalate"; notices: Notice[] };

/** The reminders and escalations due now, each with the card as it should be saved. */
export function followUps(cards: PurchaseCard[], now: string, directorsOf: (fund: string) => string[]): FollowUp[] {
  const out: FollowUp[] = [];
  const nowMs = Date.parse(now);
  for (const c of cards) {
    const who = waitingOn(c);
    if (!who) continue;
    const p = c.purchase;
    const f = p.followUp && p.followUp.stage === p.stage && p.followUp.since === p.stageSince ? p.followUp : { stage: p.stage, since: p.stageSince };
    const age = daysWaiting(c, nowMs);
    const href = `/purchases/${c.id}`;
    const step = STAGE_LABEL[p.stage].toLowerCase();
    if (p.stage === "chair" && age >= ESCALATE_DAYS && !f.escalatedAt) {
      const directors = p.restricted ? [] : directorsOf(p.fund).filter((d) => d.toLowerCase() !== c.ownerEmail.toLowerCase() && d.toLowerCase() !== p.approverEmail?.toLowerCase());
      const to: Recipient[] = directors.length ? directors.map((email) => ({ email })) : [{ role: "finance" }];
      const text = `${label(c)} has waited ${days(age)} for ${step} from ${p.approverEmail ?? "the committee's chair"}. ${directors.length ? "As the committee's director you can approve it." : "Please follow up with the committee."}`;
      out.push({ card: mark(c, { ...f, escalatedAt: now, remindedAt: f.remindedAt ?? now }, now, "Overdue: sent to the director"), kind: "escalate", notices: to.map((t) => ({ to: t, cardId: c.id, href, text, alert: true, delegable: false })) });
    } else if (age >= REMINDER_DAYS && !f.remindedAt) {
      const text = `Reminder: ${label(c)} has waited ${days(age)} for your ${step}.`;
      out.push({ card: mark(c, { ...f, remindedAt: now }, now, "Reminder sent"), kind: "remind", notices: [{ to: who, cardId: c.id, href, text, alert: true, delegable: "email" in who }] });
    }
  }
  return out;
}

function mark(c: PurchaseCard, followUp: NonNullable<PurchaseCard["purchase"]["followUp"]>, now: string, action: string): PurchaseCard {
  return { ...c, purchase: { ...c.purchase, followUp, history: [...c.purchase.history, { at: now, by: "portal", action }] } };
}

/** The weekday morning digest: one per chair approver, one for finance's queue. Empty on weekends. */
export function morningDigest(cards: PurchaseCard[], now: string): Notice[] {
  const dow = new Date(now).getUTCDay();
  if (dow === 0 || dow === 6) return [];
  const byWho = new Map<string, { to: Recipient; items: PurchaseCard[] }>();
  for (const c of cards) {
    const who = waitingOn(c);
    if (!who) continue;
    const key = "email" in who ? who.email.toLowerCase() : `role:${who.role}`;
    const entry = byWho.get(key) ?? { to: who, items: [] };
    entry.items.push(c);
    byWho.set(key, entry);
  }
  const nowMs = Date.parse(now);
  const out: Notice[] = [];
  for (const { to, items } of byWho.values()) {
    const sorted = [...items].sort((a, b) => daysWaiting(b, nowMs) - daysWaiting(a, nowMs));
    const list = sorted.slice(0, 8).map((c) => `${label(c)}, ${days(daysWaiting(c, nowMs))}`).join("; ");
    const more = sorted.length > 8 ? `; and ${sorted.length - 8} more` : "";
    const whose = "email" in to ? "you" : to.role === "finance" ? "the finance office" : "the executive";
    out.push({ to, href: "/purchases", text: `Good morning. ${sorted.length} purchase request${sorted.length === 1 ? " is" : "s are"} waiting on ${whose}: ${list}${more}.`, alert: true, delegable: "email" in to });
  }
  return out;
}
