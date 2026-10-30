"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/Button";
import { DateField, TimeField } from "@/components/DateField";
import { Field, FormActions } from "@/components/Field";
import { FormErrors, type FormState } from "@/components/FormErrors";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { dayText, timeText } from "@/lib/events/series";
import type { TimeEdit } from "@/lib/events/types";
import { type DraftCheck, checkTime } from "./actions";
import { ChecksList, QuickFixes, Timeline, checksSummary } from "./ui";
import styles from "./events.module.css";

export type TimeFormProps = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  id: string;
  /** The request's updatedAt, so a change made meanwhile isn't overwritten. */
  expected: string;
  initial: TimeEdit;
  /** Inside the room policy's lead time: the date can't be changed here. */
  dateLocked?: string;
  /** Approved: the new time waits for the director, and the approved one stays booked. */
  approved: boolean;
  series: boolean;
  today: string;
};

/**
 * Change an event's date, time, setup or cleanup, with the same live checks
 * as the request form and the room's day beside it.
 */
export default function TimeForm(p: TimeFormProps) {
  const [state, formAction] = useActionState(p.action, { errors: [] });
  const [t, setT] = useState<TimeEdit>(p.initial);
  const [result, setResult] = useState<DraftCheck>({ checks: [], clashes: [], timelines: [] });
  const [checking, startCheck] = useTransition();
  const seq = useRef(0);
  const set = <K extends keyof TimeEdit>(k: K, v: TimeEdit[K]) => setT((x) => ({ ...x, [k]: v }));

  const key = JSON.stringify(t);
  useEffect(() => {
    const n = ++seq.current;
    const timer = setTimeout(() => {
      startCheck(async () => {
        const r = await checkTime(p.id, t);
        if (n === seq.current) setResult(r);
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const unchanged = JSON.stringify(t) === JSON.stringify(p.initial);
  const blockers = result.checks.filter((c) => c.block);
  const summary = checksSummary(result.checks);

  return (
    <div className={styles.formGrid}>
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="expected" value={p.expected} />
        <input type="hidden" name="date" value={t.date} />
        <input type="hidden" name="start" value={t.start} />
        <input type="hidden" name="end" value={t.end} />
        <input type="hidden" name="setup" value={t.setup} />
        <input type="hidden" name="teardown" value={t.teardown} />
        <FormErrors errors={state.errors} />
        {p.approved && <Note>The approved time stays booked until the new one is approved (by the committee&apos;s director, or an executive when there&apos;s no director). The marketing and A/V teams are told once it&apos;s approved.</Note>}
        {p.dateLocked && <Note tone="warn">{p.dateLocked}</Note>}
        <Panel title="When">
          <div className="grid two">
            {p.dateLocked ? (
              <Field label={p.series ? "First date" : "Date"} hint="Contact the IAR office to change it.">
                <input value={dayText(t.date)} disabled />
              </Field>
            ) : (
              <DateField label={p.series ? "First date" : "Date"} hint={p.series ? "The series keeps how often it repeats and its end date." : undefined} value={t.date} min={p.today} onChange={(v) => v && set("date", v)} required />
            )}
            <span />
            <TimeField label="Event starts" value={t.start} onChange={(v) => set("start", v)} required />
            <TimeField label="Event ends" value={t.end} onChange={(v) => set("end", v)} required />
            <Field label="Setup before (minutes)">
              <input type="number" min={0} max={240} step={5} value={t.setup} onChange={(e) => set("setup", Number(e.target.value))} />
            </Field>
            <Field label="Cleanup after (minutes)">
              <input type="number" min={0} max={240} step={5} value={t.teardown} onChange={(e) => set("teardown", Number(e.target.value))} />
            </Field>
          </div>
        </Panel>
        <FormActions>
          {blockers.length > 0 && <span className="hint">{result.fixes?.length ? "Use a suggested fix, or pick another time." : "Fix the conflicts in the checks first."}</span>}
          <Button href={`/events/${p.id}`} variant="quiet">Cancel</Button>
          <Submit label={p.approved ? "Ask for this change" : "Save the new time"} disabled={unchanged || blockers.length > 0} />
        </FormActions>
      </form>

      <div className={styles.aside}>
        <Panel title="Checks" right={summary ? <Pill tone={summary.tone} status>{checking ? "Checking…" : summary.label}</Pill> : undefined}>
          <div className="stack">
            <ChecksList checks={result.checks} empty="Checking…" />
            {result.clashes.map((c) => (
              <div key={c.key} className={styles.ask}>
                <strong>{c.label}</strong> has {c.roomName}, {timeText(c.start)}–{timeText(c.end)}
                {c.dates.length > 1 ? ` on ${c.dates.length} dates` : ` on ${dayText(c.dates[0])}`}.
              </div>
            ))}
            <QuickFixes fixes={result.fixes} text={result.fixText} button={(f, label) => <Button size="small" onClick={() => setT(f.edit)}>{label}</Button>} />
          </div>
        </Panel>
        <Panel title="IAR calendar that day" className={styles.calendarPanel}>
          {result.timelines.length > 0 ? (
            <div className="stack">
              {result.timelines.map((tl, i) => (
                <Timeline key={tl.roomName} items={tl.items} request={tl.request} caption={`${tl.roomName} · ${dayText(tl.date)}`} legend={i === result.timelines.length - 1} />
              ))}
            </div>
          ) : (
            <p className="hint">Off-site: nothing to check on the calendar.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Submit({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" type="submit" disabled={pending || disabled}>
      {pending ? "Saving…" : label}
    </Button>
  );
}
