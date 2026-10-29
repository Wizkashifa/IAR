import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Chips } from "@/components/Chips";
import { EmptyState } from "@/components/EmptyState";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel, PanelFoot } from "@/components/Panel";
import { todayLocal } from "@/lib/dates";
import { cardStore, type Card } from "@/lib/cards";
import { feedbackStore } from "@/lib/feedback";
import { formStartStore } from "@/lib/form-starts";
import {
  MEASURED,
  MEASURED_LABEL,
  RANGES,
  feedbackByKind,
  fmtWait,
  periodsFor,
  rangeOf,
  requestsPer,
  sentBack,
  sentSince,
  startedVsSent,
  stepTimes,
  type MeasureCard,
} from "@/lib/measures";
import { requireViewer } from "@/lib/viewer";
import styles from "./measures.module.css";
import { historyOf } from "@/lib/kinds";
import { DataTable, cell } from "@/components/DataTable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portal measures" };

/** The most recent requests read; the range then keeps those sent in it. Enough for a year at IAR. */
const RECENT = 5000;

const toMeasure = (c: Card): MeasureCard => ({ type: c.type, createdAt: c.createdAt, updatedAt: c.updatedAt, history: historyOf(c) });
const shortDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthName = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** A thin bar, its length a share of `of`. Bars are drawn in SVG so no inline styles are needed. */
function Bar({ value, of, label }: { value: number; of: number; label: string }) {
  const w = of ? Math.max(value ? 1.5 : 0, (value / of) * 100) : 0;
  return (
    <svg className={styles.bar} viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label={label}>
      <title>{label}</title>
      <rect className={styles.track} x="0" y="0" width="100" height="8" rx="2" />
      {w > 0 && <rect className={styles.fill} x="0" y="0" width={w} height="8" rx="2" />}
    </svg>
  );
}

/**
 * Admins and executives: how the portal is being used, counted from its own requests
 * and feedback (lib/measures.ts), over the last 6 weeks, 3 months or 12
 * months (?range=). Counts and times only; nothing here says who did what.
 */
export default async function MeasuresPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const viewer = await requireViewer();
  const admin = viewer.actingRoles.includes("admins");
  if (!admin && !viewer.roles.includes("executive")) redirect("/");

  const range = rangeOf((await searchParams).range);
  const rangeLabel = RANGES.find((r) => r.id === range)!.label;
  const now = new Date();
  const { by, periods, start } = periodsFor(range, now);
  const since = todayLocal(new Date(start));
  const [all, feedback, started] = await Promise.all([
    (await cardStore()).listRecent(RECENT).then((xs) => xs.map(toMeasure)),
    (await feedbackStore()).list(1000),
    (await formStartStore()).since(since),
  ]);
  // Every panel looks at the same range: requests sent in it, and feedback sent in it.
  const cards = all.filter((c) => sentSince(c, start));

  const rows = requestsPer(cards, periods);
  const rowTotal = (w: (typeof rows)[number]) => MEASURED.reduce((a, t) => a + w.counts[t], 0);
  const busiest = Math.max(1, ...rows.map(rowTotal));
  const rowName = (day: string) => (by === "month" ? monthName(day) : shortDay(day));
  const back = sentBack(cards);
  const forms = startedVsSent(started, cards, since);
  const fb = feedbackByKind(feedback.filter((f) => Date.parse(f.at) >= start));

  return (
    <>
      <ModuleHead
        title="Portal measures"
        lead="How the portal is being used, counted from its own requests and feedback. Counts and times only: nothing here says who did what."
      />
      <Chips label="Show" chips={RANGES.map((r) => ({ label: r.label, href: r.id === "6w" ? "/admin/measures" : `/admin/measures?range=${r.id}`, on: r.id === range }))} />

      <Panel title={by === "month" ? "Requests sent each month" : "Requests sent each week"} right={rangeLabel} flush className={styles.first}>
          <DataTable>
            <caption className="sr-only">Requests sent each {by}, by kind</caption>
            <thead>
              <tr>
                <th scope="col">{by === "month" ? "Month" : "Week starting"}</th>
                {MEASURED.map((t) => (
                  <th key={t} scope="col" className={`${cell.num} ${styles.wideOnly}`}>
                    {MEASURED_LABEL[t]}
                  </th>
                ))}
                <th scope="col" className={cell.num}>
                  All
                </th>
                <th scope="col" className={styles.barCol}>
                  <span className="sr-only">Compared with the busiest {by}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.day}>
                  <th scope="row">{rowName(w.day)}</th>
                  {MEASURED.map((t) => (
                    <td key={t} className={`${cell.num} ${styles.wideOnly}`}>
                      {w.counts[t]}
                    </td>
                  ))}
                  <td className={`${cell.num} ${styles.total}`}>{rowTotal(w)}</td>
                  <td className={styles.barCol}>
                    <Bar value={rowTotal(w)} of={busiest} label={`${rowTotal(w)} requests ${by === "month" ? `in ${rowName(w.day)}` : `in the week starting ${rowName(w.day)}`}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
      </Panel>

      <h2>How long requests wait at each step</h2>
      <p className="lead">
        From the history of each request sent in the {rangeLabel.toLowerCase()}: the time between reaching a step and someone moving it on. &ldquo;Usually&rdquo; is the
        middle value. Requests still sitting at a step aren&apos;t counted until they move.
      </p>
      <div className={styles.grid}>
        {MEASURED.map((type) => {
          const steps = stepTimes(cards, type);
          const longest = Math.max(1, ...steps.map((s) => s.longestMs));
          return (
            <Panel key={type} title={MEASURED_LABEL[type]} level={3} flush>
              {steps.length === 0 ? (
                <EmptyState icon="clock">No finished steps yet.</EmptyState>
              ) : (
                <DataTable>
                  <caption className="sr-only">Time at each step for {MEASURED_LABEL[type]}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Step</th>
                      <th scope="col" className={cell.num}>
                        Times
                      </th>
                      <th scope="col">Usually</th>
                      <th scope="col">Longest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((s) => (
                      <tr key={s.step}>
                        <th scope="row">{s.step}</th>
                        <td className={cell.num}>{s.times}</td>
                        <td>
                          <div className={styles.wait}>
                            <span>{fmtWait(s.medianMs)}</span>
                            <Bar value={s.medianMs} of={longest} label={`${s.step}: usually ${fmtWait(s.medianMs)}`} />
                          </div>
                        </td>
                        <td className="hint">{fmtWait(s.longestMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </Panel>
          );
        })}
      </div>

      <div className={styles.grid}>
        <Panel title="Sent back to the requester" level={2} right={rangeLabel} flush>
          <DataTable>
            <caption className="sr-only">Requests sent back for changes, or with a question from marketing</caption>
            <thead>
              <tr>
                <th scope="col">Kind</th>
                <th scope="col" className={cell.num}>
                  Requests
                </th>
                <th scope="col" className={cell.num}>
                  Sent back
                </th>
                <th scope="col" className={cell.num}>
                  Times
                </th>
              </tr>
            </thead>
            <tbody>
              {back.map((b) => (
                <tr key={b.type}>
                  <th scope="row">{MEASURED_LABEL[b.type]}</th>
                  <td className={cell.num}>{b.requests}</td>
                  <td className={cell.num}>
                    {b.sentBack} <span className="hint">({pct(b.sentBack, b.requests)}%)</span>
                  </td>
                  <td className={cell.num}>{b.times}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <PanelFoot>For changes, or with a question from the marketing team. From the {cards.length} requests sent in the {rangeLabel.toLowerCase()}.</PanelFoot>
        </Panel>

        <Panel title="Forms started but not sent" right={`Since ${shortDay(since)}`} flush>
          <DataTable>
            <caption className="sr-only">Request forms someone started typing in, against requests sent</caption>
            <thead>
              <tr>
                <th scope="col">Form</th>
                <th scope="col" className={cell.num}>
                  Started
                </th>
                <th scope="col" className={cell.num}>
                  Sent
                </th>
                <th scope="col" className={cell.num}>
                  Not sent
                </th>
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.form}>
                  <th scope="row">{MEASURED_LABEL[f.form]}</th>
                  <td className={cell.num}>{f.started}</td>
                  <td className={cell.num}>{f.sent}</td>
                  <td className={`${cell.num} ${f.notSent ? styles.total : ""}`}>{f.notSent}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <PanelFoot>
            A form counts as started the first time someone types in it; only the form&apos;s name and the day are kept. Requests opened another way (a Jira import, a
            preventive schedule) count as sent without a start.
          </PanelFoot>
        </Panel>

        <Panel title="Feedback" right={admin ? <Link href="/feedback">See the feedback</Link> : undefined} flush>
          <DataTable>
            <caption className="sr-only">Feedback received, by kind</caption>
            <thead>
              <tr>
                <th scope="col">Kind</th>
                <th scope="col" className={cell.num}>
                  Received
                </th>
                <th scope="col" className={cell.num}>
                  Still open
                </th>
              </tr>
            </thead>
            <tbody>
              {fb.map((f) => (
                <tr key={f.kind}>
                  <th scope="row">{f.label}</th>
                  <td className={cell.num}>{f.count}</td>
                  <td className={cell.num}>{f.open}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      </div>
    </>
  );
}
