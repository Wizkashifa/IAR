/**
 * When the portal can't reach a Google service. Each failure is logged as one
 * structured line (`portalHealth`) that a log-based alert in go-live watches,
 * and the admins get a plain-language message: by Chat in the admins' space,
 * by email when Chat is what failed or can't deliver. At most one message per
 * service every 6 hours. Pages can ask isDegraded() to say "Some information
 * may be out of date".
 *
 * The core (createHealth) is plain and tested; the default instance below
 * loads Chat, mail and settings only when it has something to send.
 */

export type Service = "directory" | "calendar" | "chat" | "drive" | "rooms" | "mail";

/** One message per service per this long. */
export const ALERT_EVERY_MS = 6 * 60 * 60 * 1000;
/** A service counts as degraded for this long after its last failure, unless it works again. */
export const DEGRADED_MS = 15 * 60 * 1000;

const WHAT: Record<Service, { name: string; meaning: string }> = {
  directory: { name: "Google Groups (who's on which team)", meaning: "Until it can, it uses the last list it had, or nobody is on a team and payment requests go to finance review." },
  rooms: { name: "IAR's room list in Google", meaning: "It's using the last room list it had." },
  calendar: { name: "the room calendars", meaning: "Room checks and bookings may be missing or out of date." },
  chat: { name: "Google Chat", meaning: "Alerts go by email where they can." },
  drive: { name: "the Shared Drive", meaning: "Receipts, W-9s and photos may not upload." },
  mail: { name: "Gmail (the portal's mailbox)", meaning: "Email alerts aren't going out." },
};

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

/** The admins' message: what failed, since when, and what it means for people. */
export function healthMessage(service: Service, since: number): { subject: string; text: string } {
  const w = WHAT[service];
  return {
    subject: `IAR Portal can't reach ${w.name}`,
    text: `The portal couldn't reach ${w.name} since ${timeOf(since)}. ${w.meaning} Details are in the Cloud Run logs (search for portalHealth).`,
  };
}

export type HealthDeps = {
  /** A message to the admins' Chat space. Throws when it can't be sent. */
  sendChat: (text: string) => Promise<void>;
  /** An email to the admins' group. Throws when it can't be sent. */
  sendMail: (subject: string, text: string) => Promise<void>;
  log: (line: string) => void;
  now: () => number;
};

type Record_ = { firstAt: number; lastAt: number; okAt: number; alertedAt: number };

export function createHealth(deps: HealthDeps) {
  const seen = new Map<Service, Record_>();

  /** Log a failure and, at most every 6 hours per service, tell the admins. Never throws. */
  async function reportFailure(service: Service, err: unknown): Promise<void> {
    const now = deps.now();
    const r = seen.get(service);
    const fresh = !r || r.okAt >= r.lastAt;
    const rec: Record_ = { firstAt: fresh ? now : r.firstAt, lastAt: now, okAt: r?.okAt ?? 0, alertedAt: r?.alertedAt ?? 0 };
    seen.set(service, rec);
    deps.log(JSON.stringify({ severity: "ERROR", portalHealth: service, message: `Couldn't reach ${WHAT[service].name}`, error: String(err instanceof Error ? err.message : err) }));
    if (rec.alertedAt && now - rec.alertedAt < ALERT_EVERY_MS) return;
    // Marked before sending, so a failure while sending (Chat reporting itself) can't loop.
    rec.alertedAt = now;
    const m = healthMessage(service, rec.firstAt);
    const byChat = async () => deps.sendChat(m.text);
    const byMail = async () => deps.sendMail(m.subject, m.text);
    for (const send of service === "chat" ? [byMail] : service === "mail" ? [byChat] : [byChat, byMail]) {
      try {
        await send();
        return;
      } catch (e) {
        deps.log(JSON.stringify({ severity: "ERROR", message: "Couldn't tell the admins about a health problem", error: String(e instanceof Error ? e.message : e) }));
      }
    }
  }

  /** The service works again. */
  function reportOk(service: Service): void {
    const r = seen.get(service);
    if (r) r.okAt = deps.now();
  }

  /** It failed in the last 15 minutes and hasn't worked since. */
  function isDegraded(service: Service, now: number = deps.now()): boolean {
    const r = seen.get(service);
    return Boolean(r) && r!.lastAt > r!.okAt && now - r!.lastAt < DEGRADED_MS;
  }

  return { reportFailure, reportOk, isDegraded };
}

// ---- The portal's own instance ------------------------------------------------

const g = globalThis as unknown as { __iarHealth?: ReturnType<typeof createHealth> };
const health = (g.__iarHealth ??= createHealth({
  async sendChat(text) {
    const { chatEnabled, postToSpace } = await import("./chat");
    if (!chatEnabled()) throw new Error("Chat is off.");
    const { portalSettings } = await import("./portal-settings");
    const space = (await portalSettings()).chatSpaces?.admins;
    if (!space) throw new Error("No Chat space for the admins in Portal Settings.");
    await postToSpace(space, { text });
  },
  async sendMail(subject, text) {
    const { mailEnabled, sendMail } = await import("./mail");
    const { roleMailbox } = await import("./org");
    const to = roleMailbox("admins");
    if (!mailEnabled() || !to) throw new Error("Email is off.");
    await sendMail([to], subject, text);
  },
  log: (line) => console.error(line),
  now: () => Date.now(),
}));

/** Log a failure to reach a Google service and tell the admins (throttled). Never throws; callers don't wait for it. */
export function reportFailure(service: Service, err: unknown): void {
  void health.reportFailure(service, err).catch(() => undefined);
}
/** An error to throw that's also reported: `throw failed("drive", "Drive upload failed: 500")`. */
export function failed(service: Service, message: string): Error {
  const e = new Error(message);
  reportFailure(service, e);
  return e;
}
export const reportOk = (service: Service) => health.reportOk(service);
export const isDegraded = (service: Service, now?: number) => health.isDegraded(service, now);
