/**
 * Beta measures: how the portal is being used, counted from the portal's own
 * requests and feedback. No outside analytics, and nothing about who did what:
 * only counts and times. Plain functions; the admin page (app/admin/measures)
 * reads the stores and passes the data in.
 */
import type { CardType } from "./cards";
import { FEEDBACK_KIND_LABEL, type FeedbackKind } from "./feedback-kinds";
import { kindOf } from "./kinds";

/** The four request kinds the beta measures. */
export type MeasuredType = Extract<CardType, "event" | "purchase" | "marketing" | "ticket">;
export const MEASURED: MeasuredType[] = ["event", "purchase", "marketing", "ticket"];
export const MEASURED_LABEL = Object.fromEntries(MEASURED.map((t) => [t, kindOf(t)!.many])) as Record<MeasuredType, string>;

/** The forms that count "started". The same names as MeasuredType. */
export type FormName = MeasuredType;
export const isFormName = (x: unknown): x is FormName => typeof x === "string" && (MEASURED as string[]).includes(x);

/** What a measure needs from a card: its kind, when it was made and its history (from the module's own field). */
export type MeasureCard = { type: CardType; createdAt?: string; updatedAt: string; history: { at: string; action: string }[] };

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** When a card was sent: its createdAt, or failing that its first history entry. */
const sentAt = (c: MeasureCard) => c.createdAt ?? c.history[0]?.at ?? c.updatedAt;

/* ---- Requests per week ------------------------------------------------ */

export type WeekCounts = { weekStart: string; counts: Record<MeasuredType, number> };

/**
 * Requests sent in each of the last `weeks` weeks, newest week last. A week is
 * the seven days ending at `now`, then the seven before that, and so on.
 */
export function requestsPerWeek(cards: MeasureCard[], now: Date, weeks = 6): WeekCounts[] {
  const end = now.getTime();
  const out: WeekCounts[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: new Date(end - (weeks - i) * WEEK).toISOString().slice(0, 10),
    counts: { event: 0, purchase: 0, marketing: 0, ticket: 0 },
  }));
  for (const c of cards) {
    if (!(MEASURED as string[]).includes(c.type)) continue;
    const ago = end - Date.parse(sentAt(c));
    if (!(ago >= 0) || ago >= weeks * WEEK) continue;
    out[weeks - 1 - Math.floor(ago / WEEK)].counts[c.type as MeasuredType]++;
  }
  return out;
}

/* ---- Time at each step ------------------------------------------------ */

/**
 * Which step a history entry ends, by its action ("Approved (Chair approval)"
 * ends Chair approval). `start: true` marks an entry that begins a step
 * without ending one ("Submitted"). Entries that are neither (a photo added,
 * a reminder) don't move the clock.
 */
type StepRule = { re: RegExp; ends?: string | ((m: RegExpMatchArray) => string); start?: boolean };

const BACK = "Back with the requester";

const RULES: Record<MeasuredType, StepRule[]> = {
  purchase: [
    { re: /^Submitted/, start: true },
    { re: /^Routed/, start: true },
    { re: /^Approved \(([^)]+)\)/, ends: (m) => m[1] },
    { re: /^Returned for changes \(([^)]+)\)/, ends: (m) => m[1] },
    { re: /^Sent back to .+ \(from ([^)]+)\)/, ends: (m) => m[1] },
    { re: /^Rejected \(([^)]+)\)/, ends: (m) => m[1] },
    { re: /^Edited and resubmitted/, ends: BACK },
    { re: /^Paid$/, ends: "To pay" },
    { re: /^Entered in QuickBooks/, ends: "QuickBooks" },
  ],
  event: [
    { re: /^Submitted/, start: true },
    { re: /^Approved as director/, ends: "Director review" },
    { re: /^Approved \(executive review\)/, ends: "Executive review" },
    { re: /^Sent back for changes \(([^)]+)\)/, ends: (m) => m[1] },
    { re: /^Denied \(([^)]+)\)/, ends: (m) => m[1] },
    { re: /^(Edited and resubmitted|Moved to give up its time)/, ends: BACK },
    { re: /^The event is over/, start: true },
    { re: /^Closed out/, ends: "Close-out" },
  ],
  marketing: [
    { re: /^Submitted/, start: true },
    { re: /^Scheduled/, ends: "Weekly review" },
    { re: /^Asked a question/, ends: "Weekly review" },
    { re: /^Declined/, ends: "Weekly review" },
    { re: /^Answered marketing's question/, ends: "Waiting on the requester" },
    { re: /^Started/, ends: "Scheduled" },
    { re: /^Done$/, ends: "In progress" },
  ],
  ticket: [
    { re: /^(Reported|Opened by|Imported from Jira)/, start: true },
    { re: /^Picked it up/, ends: "New, waiting to be picked up" },
    { re: /^Started work/, ends: "Picked up, not started" },
    { re: /^Waiting on parts/, ends: "Being worked on" },
    { re: /^Parts are in/, ends: "Waiting on parts" },
    { re: /^(Marked fixed|Done$)/, ends: "Being worked on" },
    { re: /^(Reporter confirmed|Closed$|Reopened: not fixed)/, ends: "Fixed, waiting for the reporter" },
  ],
};

/** The step this action ends, or null; and whether it starts the clock again. */
export function stepOf(type: MeasuredType, action: string): { ends: string | null; moves: boolean } {
  for (const r of RULES[type]) {
    const m = action.match(r.re);
    if (!m) continue;
    const ends = r.ends === undefined ? null : typeof r.ends === "string" ? r.ends : r.ends(m);
    return { ends, moves: true };
  }
  return { ends: null, moves: false };
}

/** The order a request moves through, so the table reads top to bottom. Steps not listed go last. */
const STEP_ORDER: Record<MeasuredType, string[]> = {
  purchase: ["Chair approval", "Finance review", "Executive approval", BACK, "To pay", "QuickBooks"],
  event: ["Director review", "Executive review", BACK, "Close-out"],
  marketing: ["Weekly review", "Waiting on the requester", "Scheduled", "In progress"],
  ticket: ["New, waiting to be picked up", "Picked up, not started", "Being worked on", "Waiting on parts", "Fixed, waiting for the reporter"],
};

export type StepTime = { step: string; times: number; medianMs: number; longestMs: number };

/**
 * For one kind of request: how long requests sat at each step before someone
 * moved them on, from each card's history. Only finished waits count; a
 * request still sitting at a step isn't in these numbers. Steps are listed in
 * the order a request moves through them.
 */
export function stepTimes(cards: MeasureCard[], type: MeasuredType): StepTime[] {
  const waits = new Map<string, number[]>();
  for (const c of cards) {
    if (c.type !== type) continue;
    const hist = [...c.history].sort((a, b) => a.at.localeCompare(b.at));
    let since: number | null = null;
    for (const h of hist) {
      const { ends, moves } = stepOf(type, h.action);
      if (!moves) continue;
      const at = Date.parse(h.at);
      if (ends && since !== null && at >= since) {
        const list = waits.get(ends) ?? [];
        list.push(at - since);
        waits.set(ends, list);
      }
      since = at;
    }
  }
  const rank = (step: string) => {
    const i = STEP_ORDER[type].indexOf(step);
    return i < 0 ? STEP_ORDER[type].length : i;
  };
  return [...waits]
    .map(([step, xs]) => ({ step, times: xs.length, medianMs: median(xs), longestMs: Math.max(...xs) }))
    .sort((a, b) => rank(a.step) - rank(b.step));
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** "Under an hour", "5 hours", "1 day", "3.5 days". */
export function fmtWait(ms: number): string {
  if (ms < 3_600_000) return "Under an hour";
  if (ms < DAY) {
    const h = Math.round(ms / 3_600_000);
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  const d = Math.round((ms / DAY) * 2) / 2;
  return `${d} day${d === 1 ? "" : "s"}`;
}

/* ---- Sent back -------------------------------------------------------- */

const SENT_BACK = /^(Returned for changes|Sent back for changes|Asked a question)/;

export type SentBack = { type: MeasuredType; requests: number; sentBack: number; times: number };

/**
 * For each kind: how many requests were sent, how many came back to the
 * requester at least once (for changes, or marketing's question), and how
 * many times in all.
 */
export function sentBack(cards: MeasureCard[]): SentBack[] {
  return MEASURED.map((type) => {
    const mine = cards.filter((c) => c.type === type);
    const backs = mine.map((c) => c.history.filter((h) => SENT_BACK.test(h.action)).length);
    return { type, requests: mine.length, sentBack: backs.filter((n) => n > 0).length, times: backs.reduce((a, b) => a + b, 0) };
  });
}

/* ---- Forms started but not sent -------------------------------------- */

/** One day's count of forms someone started typing in. */
export type StartedCount = { day: string; form: FormName; count: number };

export type StartedVsSent = { form: FormName; started: number; sent: number; notSent: number };

/**
 * Forms started against requests sent, since `sinceDay` (YYYY-MM-DD). A form
 * started and sent the same day counts once each side, so "not sent" is the
 * difference, never below zero. Requests sent some other way (an import, a
 * preventive schedule) can make "sent" larger than "started".
 */
export function startedVsSent(started: StartedCount[], cards: MeasureCard[], sinceDay: string): StartedVsSent[] {
  return MEASURED.map((form) => {
    const s = started.filter((x) => x.form === form && x.day >= sinceDay).reduce((a, x) => a + x.count, 0);
    const sent = cards.filter((c) => c.type === form && sentAt(c).slice(0, 10) >= sinceDay).length;
    return { form, started: s, sent, notSent: Math.max(0, s - sent) };
  });
}

/* ---- Feedback --------------------------------------------------------- */

export type FeedbackCount = { kind: FeedbackKind; label: string; count: number; open: number };

/** Beta feedback by kind, with how many are still open. */
export function feedbackByKind(items: { kind: FeedbackKind; status: "new" | "done" }[]): FeedbackCount[] {
  return (Object.keys(FEEDBACK_KIND_LABEL) as FeedbackKind[]).map((kind) => {
    const mine = items.filter((f) => f.kind === kind);
    return { kind, label: FEEDBACK_KIND_LABEL[kind], count: mine.length, open: mine.filter((f) => f.status === "new").length };
  });
}
