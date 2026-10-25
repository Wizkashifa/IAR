import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { todayLocal } from "@/lib/away";
import { cardStore, type Card } from "@/lib/cards";
import { feedbackStore } from "@/lib/feedback";
import { formStartStore } from "@/lib/form-starts";
import {
  MEASURED,
  MEASURED_LABEL,
  feedbackByKind,
  fmtWait,
  requestsPerWeek,
  sentBack,
  startedVsSent,
  stepTimes,
  type MeasureCard,
} from "@/lib/measures";
import { requireViewer } from "@/lib/viewer";
import styles from "./measures.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Beta measures" };

/** How far back the page looks. */
const WEEKS = 6;
/** The most recent requests read for the step times and sent-back counts. */
const RECENT = 2000;

const historyOf = (c: Card) => c.purchase?.history ?? c.event?.history ?? c.marketing?.history ?? c.ticket?.history ?? [];
const toMeasure = (c: Card): MeasureCard => ({ type: c.type, createdAt: c.createdAt, updatedAt: c.updatedAt, history: historyOf(c) });
const shortDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
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
 * Admins only: how the beta is going, counted from the portal's own requests
 * and feedback (lib/measures.ts). Counts and times only; nothing here says
 * who did what.
 */
export default async function MeasuresPage() {
  const viewer = await requireViewer();
  if (!viewer.actingRoles.includes("admins")) redirect("/");

  const now = new Date();
  const since = todayLocal(new Date(now.getTime() - WEEKS * 7 * 86_400_000));
  const [cards, feedback, started] = await Promise.all([
    (await cardStore()).listRecent(RECENT).then((xs) => xs.map(toMeasure)),
    (await feedbackStore()).list(1000),
    (await formStartStore()).since(since),
  ]);

  const weeks = requestsPerWeek(cards, now, WEEKS);
  const weekTotal = (w: (typeof weeks)[number]) => MEASURED.reduce((a, t) => a + w.counts[t], 0);
  const busiest = Math.max(1, ...weeks.map(weekTotal));
  const back = sentBack(cards);
  const forms = startedVsSent(started, cards, since);
  const fb = feedbackByKind(feedback);

  return (
    <>
      <ModuleHead
        title="Beta measures"
        lead="How the beta is going, counted from the portal's own requests and feedback. Counts and times only: nothing here says who did what."
      />

      <Panel title="Requests sent each week" right={`Last ${WEEKS} weeks`} flush className={styles.first}>
        <div className="tablewrap">
          <table className={styles.table}>
            <caption className="sr-only">Requests sent each week, by kind</caption>
            <thead>
              <tr>
                <th scope="col">Week starting</th>
                {MEASURED.map((t) => (
                  <th key={t} scope="col" className={`${styles.num} ${styles.wideOnly}`}>
                    {MEASURED_LABEL[t]}
                  </th>
                ))}
                <th scope="col" className={styles.num}>
                  All
                </th>
                <th scope="col" className={styles.barCol}>
                  <span className="sr-only">Compared with the busiest week</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.weekStart}>
                  <th scope="row">{shortDay(w.weekStart)}</th>
                  {MEASURED.map((t) => (
                    <td key={t} className={`${styles.num} ${styles.wideOnly}`}>
                      {w.counts[t]}
                    </td>
                  ))}
                  <td className={`${styles.num} ${styles.total}`}>{weekTotal(w)}</td>
                  <td className={styles.barCol}>
                    <Bar value={weekTotal(w)} of={busiest} label={`${weekTotal(w)} requests in the week starting ${shortDay(w.weekStart)}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <h2>How long requests wait at each step</h2>
      <p className="lead">
        From each request&apos;s history: the time between reaching a step and someone moving it on. &ldquo;Usually&rdquo; is the middle value. Requests still sitting at a
        step aren&apos;t counted until they move.
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
                <table className={styles.table}>
                  <caption className="sr-only">Time at each step for {MEASURED_LABEL[type]}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Step</th>
                      <th scope="col" className={styles.num}>
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
                        <td className={styles.num}>{s.times}</td>
                        <td>
                          <div className={styles.wait}>
                            <span>{fmtWait(s.medianMs)}</span>
                            <Bar value={s.medianMs} of={longest} label={`${s.step}: usually ${fmtWait(s.medianMs)}`} />
                          </div>
                        </td>
                        <td className={styles.muted}>{fmtWait(s.longestMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          );
        })}
      </div>

      <div className={styles.grid}>
        <Panel title="Sent back to the requester" level={2} flush>
          <table className={styles.table}>
            <caption className="sr-only">Requests sent back for changes, or with a question from marketing</caption>
            <thead>
              <tr>
                <th scope="col">Kind</th>
                <th scope="col" className={styles.num}>
                  Requests
                </th>
                <th scope="col" className={styles.num}>
                  Sent back
                </th>
                <th scope="col" className={styles.num}>
                  Times
                </th>
              </tr>
            </thead>
            <tbody>
              {back.map((b) => (
                <tr key={b.type}>
                  <th scope="row">{MEASURED_LABEL[b.type]}</th>
                  <td className={styles.num}>{b.requests}</td>
                  <td className={styles.num}>
                    {b.sentBack} <span className={styles.muted}>({pct(b.sentBack, b.requests)}%)</span>
                  </td>
                  <td className={styles.num}>{b.times}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.foot}>For changes, or with a question from the marketing team. From the {cards.length} most recent requests.</p>
        </Panel>

        <Panel title="Forms started but not sent" right={`Since ${shortDay(since)}`} flush>
          <table className={styles.table}>
            <caption className="sr-only">Request forms someone started typing in, against requests sent</caption>
            <thead>
              <tr>
                <th scope="col">Form</th>
                <th scope="col" className={styles.num}>
                  Started
                </th>
                <th scope="col" className={styles.num}>
                  Sent
                </th>
                <th scope="col" className={styles.num}>
                  Not sent
                </th>
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.form}>
                  <th scope="row">{MEASURED_LABEL[f.form]}</th>
                  <td className={styles.num}>{f.started}</td>
                  <td className={styles.num}>{f.sent}</td>
                  <td className={`${styles.num} ${f.notSent ? styles.total : ""}`}>{f.notSent}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.foot}>
            A form counts as started the first time someone types in it; only the form&apos;s name and the day are kept. Requests opened another way (a Jira import, a
            preventive schedule) count as sent without a start.
          </p>
        </Panel>

        <Panel title="Beta feedback" right={<Link href="/feedback">See the feedback</Link>} flush>
          <table className={styles.table}>
            <caption className="sr-only">Feedback received, by kind</caption>
            <thead>
              <tr>
                <th scope="col">Kind</th>
                <th scope="col" className={styles.num}>
                  Received
                </th>
                <th scope="col" className={styles.num}>
                  Still open
                </th>
              </tr>
            </thead>
            <tbody>
              {fb.map((f) => (
                <tr key={f.kind}>
                  <th scope="row">{f.label}</th>
                  <td className={styles.num}>{f.count}</td>
                  <td className={styles.num}>{f.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
