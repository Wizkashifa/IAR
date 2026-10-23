import type { Check } from "@/lib/events/types";
import { timeText } from "@/lib/events/series";

/** Pieces the event pages share. Plain components that work on the server and in the form. */

const ICON: Record<Check["sev"], string> = { ok: "✓", warn: "!", bad: "×", info: "i" };

export function ChecksList({ checks }: { checks: Check[] }) {
  if (!checks.length) return <p className="note">Pick a date, times and a room to see the checks.</p>;
  return (
    <ul className="evchecks">
      {checks.map((c, i) => (
        <li key={i} className={`evcheck ${c.sev}`}>
          <span className="ic" aria-hidden="true">{ICON[c.sev]}</span>
          <div>
            {c.text}
            {c.rule && <div className="rule">{c.rule}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

const DAY_START = 7 * 60;
const DAY_END = 23 * 60;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const pos = (t: string) => ((Math.max(DAY_START, Math.min(DAY_END, toMin(t))) - DAY_START) / (DAY_END - DAY_START)) * 100;

/** One room's day, 7 AM to 11 PM: what's booked, and the request with its setup and cleanup. */
export function Timeline({ items, request, caption }: { items: { start: string; end: string; label: string; kind: string }[]; request?: { start: string; end: string }; caption?: string }) {
  const all = [...items.map((x) => ({ ...x, cls: x.kind })), ...(request ? [{ ...request, label: "Your request", kind: "req", cls: "req" }] : [])].sort((a, b) => toMin(a.start) - toMin(b.start));
  // Overlapping entries go on separate rows so each label stays readable.
  const ends: number[] = [];
  const placed = all.map((x) => {
    let lane = ends.findIndex((e) => e <= toMin(x.start));
    if (lane < 0) lane = ends.length;
    ends[lane] = toMin(x.end);
    return { ...x, lane };
  });
  const rows = Math.max(1, ...placed.map((x) => x.lane + 1));
  return (
    <div>
      {caption && <div className="sub">{caption}</div>}
      <div className="tl" style={{ height: rows * 30 + 4 }}>
        {placed.map((x, i) => (
          <div key={i} className={`blk ${x.cls}`} style={{ left: `${pos(x.start)}%`, width: `${Math.max(1, pos(x.end) - pos(x.start))}%`, top: 4 + x.lane * 30 }} title={`${x.label} ${timeText(x.start)}–${timeText(x.end)}`}>
            {x.label}
          </div>
        ))}
      </div>
      <div className="tl-axis">
        <span>7 AM</span>
        <span>11 AM</span>
        <span>3 PM</span>
        <span>7 PM</span>
        <span>11 PM</span>
      </div>
      <div className="legend">
        <span><i className="standing" />Standing hold (policy)</span>
        <span><i className="booking" />Booked or pending</span>
        {request && <span><i className="req" />Your request, with setup and cleanup</span>}
      </div>
    </div>
  );
}
