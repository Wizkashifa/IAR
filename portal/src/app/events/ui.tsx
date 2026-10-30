import type { Check, MarketingBrief } from "@/lib/events/types";
import { KeyValue } from "@/components/KeyValue";
import { timeText } from "@/lib/events/series";
import { Icon, type IconName } from "@/components/Icon";
import styles from "./events.module.css";

/** Pieces the event pages share. Plain components that work on the server and in the form. */

const ICON: Record<Check["sev"], IconName> = { ok: "check", warn: "alert", bad: "x", info: "info" };

/** The room and policy checks. `empty` is what to say when there are none. */
export function ChecksList({ checks, empty = "Pick a date, times and a room to see the checks." }: { checks: Check[]; empty?: string }) {
  if (!checks.length) return <p className="hint">{empty}</p>;
  return (
    <ul className={styles.checks}>
      {checks.map((c, i) => (
        <li key={i} className={styles.check}>
          <span className={`${styles.ic} ${styles[c.sev]}`} aria-hidden="true">
            <Icon name={ICON[c.sev]} size="sm" />
          </span>
          <div>
            {c.text}
            {c.rule && <div className={styles.rule}>{c.rule}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "All clear", "Flags to review" or "Conflict", for the checks panel's header. */
export function checksSummary(checks: Check[]): { tone: "ok" | "warn" | "bad"; label: string } | null {
  if (checks.some((c) => c.sev === "bad")) return { tone: "bad", label: "Conflict" };
  if (checks.some((c) => c.sev === "warn")) return { tone: "warn", label: "Flags to review" };
  return checks.length ? { tone: "ok", label: "All clear" } : null;
}

const DAY_START = 7 * 60;
const DAY_END = 23 * 60;
const LANE = 30;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Where a time sits across the day, as a percentage of the width. */
const pct = (t: string) => ((Math.max(DAY_START, Math.min(DAY_END, toMin(t))) - DAY_START) / (DAY_END - DAY_START)) * 100;

export type TimelineItem = { start: string; end: string; label: string; kind: string };

/**
 * One room's day, 7 AM to 11 PM: what's booked, and the request with its setup
 * and cleanup. Drawn as SVG with percentage positions, so each booking's place
 * comes from its times without inline styles.
 */
/** `legend: false` leaves out the key, for all but the last of several timelines in a row. */
export function Timeline({ items, request, caption, legend = true }: { items: TimelineItem[]; request?: { start: string; end: string }; caption?: string; legend?: boolean }) {
  const all = [...items, ...(request ? [{ ...request, label: "Your request", kind: "req" }] : [])].sort((a, b) => toMin(a.start) - toMin(b.start));
  // Overlapping entries go on separate rows so each label stays readable.
  const ends: number[] = [];
  const placed = all.map((x) => {
    let lane = ends.findIndex((e) => e <= toMin(x.start));
    if (lane < 0) lane = ends.length;
    ends[lane] = toMin(x.end);
    return { ...x, lane };
  });
  const rows = Math.max(1, ...placed.map((x) => x.lane + 1));
  const h = rows * LANE + 6;
  const kind = (k: string) => (k === "req" ? styles.req : k === "pending" ? styles.pending : styles.booking);
  return (
    <div className={styles.timeline}>
      {caption && <div className={styles.caption}>{caption}</div>}
      <svg className={styles.tl} width="100%" height={h} role="img" aria-label={caption ? `What's booked: ${caption}` : "What's booked that day"}>
        {placed.map((x, i) => {
          const x0 = pct(x.start);
          const w = Math.max(0.8, pct(x.end) - x0);
          return (
            <g key={i} className={kind(x.kind)}>
              <title>{`${x.label} ${timeText(x.start)}–${timeText(x.end)}`}</title>
              <rect x={`${x0}%`} y={4 + x.lane * LANE} width={`${w}%`} height={LANE - 4} rx={6} />
              <foreignObject x={`${x0}%`} y={4 + x.lane * LANE} width={`${w}%`} height={LANE - 4}>
                <span className={styles.lbl}>{x.label}</span>
              </foreignObject>
            </g>
          );
        })}
      </svg>
      <div className={styles.axis} aria-hidden="true">
        <span>7 AM</span>
        <span>11 AM</span>
        <span>3 PM</span>
        <span>7 PM</span>
        <span>11 PM</span>
      </div>
      {legend && (
        <ul className={styles.legend}>
          <li><i className={styles.kBooking} />Booked or pending</li>
          {request && <li><i className={styles.kReq} />Your request, with setup and cleanup</li>}
        </ul>
      )}
    </div>
  );
}

/** An event's marketing brief, on the event's page and on each of its marketing pieces. */
export function BriefFields({ brief, stacked }: { brief: MarketingBrief; stacked?: boolean }) {
  return (
    <KeyValue
      stacked={stacked}
      items={[
        { label: "Subtitle", value: brief.subtitle },
        { label: "Announcement", value: brief.text && <span className="pre">{brief.text}</span> },
        { label: "On the flyer", value: brief.flyer && <span className="pre">{brief.flyer}</span> },
        { label: "Registration", value: brief.regLink },
        { label: "Payment", value: brief.payment && <span className="pre">{brief.payment}</span> },
        { label: "Files", value: brief.files && <a href={brief.files} target="_blank" rel="noreferrer">Drive folder</a> },
      ]}
    />
  );
}
