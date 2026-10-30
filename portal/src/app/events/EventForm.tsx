"use client";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { FormStarted } from "@/components/FormStarted";
import { Button } from "@/components/Button";
import { DateField, TimeField } from "@/components/DateField";
import { Field, FormActions, RequiredKey, RequiredTag } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { RoomPicker } from "@/components/RoomPicker";
import { FileDrop } from "@/components/FileDrop";
import { IMAGE_ACCEPT, MAX_FILE_MB, MAX_PER_UPLOAD } from "@/lib/marketing/files";
import type { EventPrefill } from "@/lib/calendar-view";
import { AV_INCLUDES, AV_KINDS } from "@/lib/events/input";
import { RECUR_LABEL, dayText, longDate, seriesMaxEnd, timeText, SERIES_MAX_MONTHS } from "@/lib/events/series";
import type { AvNeeds, EventInput, MarketingBrief, RecurFreq } from "@/lib/events/types";
import { type DraftCheck, checkDraft } from "./actions";
import { ChecksList, Timeline, checksSummary } from "./ui";
import styles from "./events.module.css";
import { FormErrors, type FormState } from "@/components/FormErrors";
import { Checkbox, Choice, Choices } from "@/components/Choices";

export type RoomChoice = { id: string; name: string; capacity: number; building: string; food: boolean };

export type EventFormProps = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  committees: { group: string; name: string }[];
  /** The committee to start on: one the person chairs, or the one they used last. */
  defaultCommittee?: string;
  rooms: RoomChoice[];
  /** Rooms this person or committee books most, listed first. */
  usedMost?: string[];
  /** The room reservation policy, linked from the agreement (Portal Settings). */
  policyUrl?: string;
  initial?: EventInput;
  /** A new request started from "Find a room" (Calendar): its date, times, room and size. */
  prefill?: EventPrefill;
  /** Resubmitting this request: its own holds don't count as clashes. */
  editing?: string;
  /** Moved to give up its time: say so. */
  moved?: boolean;
  /** Renewing this series: the next period of it. */
  renews?: { id: string; until: string };
  today: string;
  submitLabel: string;
  /** Whether images for marketing can be uploaded (go-live has made the Marketing Files drive). */
  uploads?: boolean;
};

type Draft = Omit<EventInput, "recur" | "brief" | "avNeeds"> & { recurFreq: RecurFreq | "none"; recurUntil: string; brief: MarketingBrief; avNeeds: AvNeeds; agree: boolean };

const blankBrief = (): MarketingBrief => ({ subtitle: "", text: "", flyer: "", regLink: "", payment: "", final: false });
const blankAv = (): AvNeeds => ({ kinds: [], includes: [], ack: false });
const ANNOUNCE_EXAMPLE = "Join us for a family game night with dinner, board games and a trivia round. All families are welcome.";

function initialDraft(p: EventFormProps): Draft {
  const i = p.initial;
  const f = p.prefill;
  const plus = (n: number) => {
    const d = new Date(`${p.today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const committee = p.committees.find((c) => c.group === (i?.committeeGroup ?? p.defaultCommittee)) ?? p.committees[0];
  return {
    title: i?.title ?? "",
    description: i?.description ?? "",
    committeeGroup: i?.committeeGroup ?? committee?.group ?? "",
    committeeName: i?.committeeName ?? committee?.name ?? "",
    date: i?.date ?? f?.date ?? plus(21),
    start: i?.start ?? f?.start ?? "18:30",
    end: i?.end ?? f?.end ?? "20:00",
    setup: i?.setup ?? 30,
    teardown: i?.teardown ?? 30,
    recurFreq: i?.recur?.freq ?? "none",
    recurUntil: i?.recur?.until ?? "",
    rooms: i?.rooms ?? f?.rooms ?? [],
    attendance: i?.attendance ?? f?.attendance ?? 20,
    budget: i?.budget ?? 0,
    food: i?.food ?? f?.food ?? false,
    isPublic: i?.isPublic ?? false,
    registration: i?.registration ?? false,
    av: i?.av ?? false,
    setupNotes: i?.setupNotes ?? "",
    newProgram: i?.newProgram ?? false,
    outsideSpeaker: i?.outsideSpeaker ?? false,
    fundraiser: i?.fundraiser ?? false,
    brief: { ...blankBrief(), ...(i?.brief ?? {}), final: false },
    avNeeds: { ...blankAv(), ...(i?.avNeeds ?? {}), ack: false },
    teamNotes: i?.teamNotes ?? "",
    agree: false,
  };
}

/** Unsent forms are kept in this browser only, so a dropped connection or a wrong tap doesn't lose them. */
const draftKey = (p: EventFormProps) => `iar.eventDraft.${p.editing ?? (p.renews ? `renew-${p.renews.id}` : "new")}`;
function readDraft(key: string): { at: string; d: Draft } | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { at: string; d: Draft }) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, d: Draft | null) {
  try {
    if (d) window.localStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), d: { ...d, agree: false } }));
    else window.localStorage.removeItem(key);
  } catch {
    // Private browsing or storage turned off: drafts just aren't kept.
  }
}

export default function EventForm(p: EventFormProps) {
  const [state, formAction] = useActionState(p.action, { errors: [] });
  const [d, setD] = useState<Draft>(() => initialDraft(p));
  const [result, setResult] = useState<DraftCheck>({ checks: [], clashes: [], timelines: [] });
  const [checking, startCheck] = useTransition();
  const [ask, setAsk] = useState<{ key: string; reason: string } | null>(null);
  const [saved, setSaved] = useState<{ at: string; d: Draft } | null>(null);
  const touched = useRef(false);
  const seq = useRef(0);
  const key = draftKey(p);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    touched.current = true;
    setD((x) => ({ ...x, [k]: v }));
  };
  const update = (f: (x: Draft) => Draft) => {
    touched.current = true;
    setD(f);
  };
  const setBrief = <K extends keyof MarketingBrief>(k: K, v: MarketingBrief[K]) => update((x) => ({ ...x, brief: { ...x.brief, [k]: v } }));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // A draft from earlier in this browser: offer it, don't force it.
  useEffect(() => {
    const s = readDraft(key);
    if (s && (s.d.title || s.d.description)) setSaved(s);
  }, [key]);
  // Keep the draft as the person types (once they've changed something).
  useEffect(() => {
    if (!touched.current) return;
    const t = setTimeout(() => writeDraft(key, d), 600);
    return () => clearTimeout(t);
  }, [d, key]);

  // A series always has an end date: fill in the longest allowed until the requester picks one.
  useEffect(() => {
    if (d.recurFreq !== "none" && d.date && !d.recurUntil) setD((x) => ({ ...x, recurUntil: seriesMaxEnd(x.date) }));
  }, [d.recurFreq, d.date, d.recurUntil]);

  // The checks the reviewers will see, run against the room calendars as the requester types.
  const checkKey = JSON.stringify([d.date, d.start, d.end, d.setup, d.teardown, d.recurFreq, d.recurUntil, d.rooms, d.attendance, d.budget, d.food, d.isPublic, d.registration, d.av, d.newProgram, d.outsideSpeaker, d.fundraiser, d.description.length > 199, Boolean(d.description), d.brief.subtitle, d.brief.text, d.brief.regLink, d.avNeeds.kinds, d.committeeGroup]);
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(() => {
      startCheck(async () => {
        const r = await checkDraft({ ...d, editing: p.editing });
        if (n === seq.current) setResult(r);
      });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);

  const askable = result.clashes.filter((c) => c.askable);
  useEffect(() => {
    if (ask && !result.clashes.some((c) => c.key === ask.key && c.askable)) setAsk(null);
  }, [result, ask]);
  const blockers = result.checks.filter((c) => c.block);
  const clashOnly = blockers.length > 0 && blockers.every((c) => c.rule === "IAR Google Calendar");
  const asking = Boolean(ask && clashOnly && result.clashes.length === 1);

  const payload = useMemo(() => ({ ...d, ...(asking ? { ask } : {}), ...(p.renews ? { renews: p.renews.id } : {}) }), [d, ask, asking, p.renews]);
  const sections = [
    { id: "evSect", n: "Event and room", done: Boolean(d.title && d.description && d.date) },
    ...(d.isPublic ? [{ id: "briefSect", n: "Marketing", done: Boolean(d.brief.subtitle && d.brief.text) }] : []),
    ...(d.av ? [{ id: "avSect", n: "A/V", done: d.avNeeds.kinds.length > 0 }] : []),
    { id: "confirmSect", n: "Confirm", done: d.agree && (!d.av || d.avNeeds.ack) && (!d.isPublic || d.brief.final) },
  ];
  const num = (id: string) => sections.findIndex((s) => s.id === id) + 1;
  const max = d.date ? seriesMaxEnd(d.date) : "";
  const summary = checksSummary(result.checks);
  const len = d.description.trim().length;
  const roomOptions = p.rooms.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity || undefined }));

  return (
    <div className={styles.formGrid}>
      <form
        action={formAction}
        className={styles.form}
        onSubmit={() => {
          // Sent: the draft isn't needed. If the server says something needs fixing, the form keeps what was typed.
          writeDraft(key, null);
          setSaved(null);
        }}
      >
        <input type="hidden" name="payload" value={JSON.stringify(payload)} />
        <FormStarted form="event" />
        {saved && (
          <Note>
            <div className={styles.draft}>
              <span>
                You started this form on {new Date(saved.at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {saved.d.title ? ` (“${saved.d.title}”)` : ""}.
              </span>
              <Button
                size="small"
                onClick={() => {
                  setD({ ...saved.d, agree: false });
                  touched.current = true;
                  setSaved(null);
                }}
              >
                Pick up where you left off
              </Button>
              <Button
                size="small"
                onClick={() => {
                  writeDraft(key, null);
                  setSaved(null);
                }}
              >
                Start fresh
              </Button>
            </div>
          </Note>
        )}
        {p.renews && <Note>The next period of {p.renews.id}, which ends {longDate(p.renews.until)}. It goes through the same checks and approval as any new request.</Note>}
        {p.moved && <Note>You gave up this event&apos;s time to someone else&apos;s request. Pick a new time; only the director needs to approve it.</Note>}
        <FormErrors errors={state.errors} />
        <RequiredKey />

        <fieldset className={styles.section} id="evSect">
          <legend><span className={styles.sn}>{num("evSect")}</span>Event and room</legend>
          <div className={styles.sectionBody}>
            <Field label="Program title" required>
              <input value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={120} required />
            </Field>
            <Field
              label="Tell us about the event"
              required
              hint={<span className={len >= 200 ? styles.good : undefined}>{len} characters. {len >= 200 ? "That gives reviewers and the teams what they need." : "A few sentences (200 or more characters) help reviewers approve faster."}</span>}
            >
              <textarea rows={5} value={d.description} onChange={(e) => set("description", e.target.value)} placeholder="What will happen and who it's for. Include the schedule and any speakers or guests." maxLength={4000} required />
            </Field>
            <div className="grid two">
              <Field label="Sponsoring committee" required>
                <select value={d.committeeGroup} onChange={(e) => update((x) => ({ ...x, committeeGroup: e.target.value, committeeName: p.committees.find((c) => c.group === e.target.value)?.name ?? "" }))}>
                  {p.committees.map((c) => <option key={c.group} value={c.group}>{c.name}</option>)}
                </select>
              </Field>
              <DateField label={d.recurFreq !== "none" ? "First date" : "Date"} value={d.date} min={p.today} onChange={(v) => v && set("date", v)} required />
              <TimeField label="Event starts" value={d.start} onChange={(v) => set("start", v)} required />
              <TimeField label="Event ends" value={d.end} onChange={(v) => set("end", v)} required />
              <Field label="Setup before (minutes)">
                <input type="number" min={0} max={240} step={15} value={d.setup} onChange={(e) => set("setup", Number(e.target.value))} />
              </Field>
              <Field label="Cleanup after (minutes)">
                <input type="number" min={0} max={240} step={15} value={d.teardown} onChange={(e) => set("teardown", Number(e.target.value))} />
              </Field>
            </div>
            <p className="hint">You set up and clean up yourselves. That time is held on the calendar for you.</p>
            <div className="grid two">
              <Field label="Repeats">
                <select value={d.recurFreq} onChange={(e) => update((x) => ({ ...x, recurFreq: e.target.value as Draft["recurFreq"], recurUntil: e.target.value === "none" ? "" : x.recurUntil }))}>
                  <option value="none">Does not repeat</option>
                  {(Object.keys(RECUR_LABEL) as RecurFreq[]).map((k) => <option key={k} value={k}>{RECUR_LABEL[k]}</option>)}
                </select>
              </Field>
              {d.recurFreq !== "none" && (
                <DateField
                  label="Repeats until"
                  value={d.recurUntil || null}
                  min={d.date}
                  max={max}
                  onChange={(v) => set("recurUntil", v ?? "")}
                  required
                  hint={`No later than ${longDate(max)} (${SERIES_MAX_MONTHS} months). Request the next period when it ends.`}
                />
              )}
            </div>
            <RoomPicker
              label="Room or rooms"
              hint={p.rooms.length ? "Leave empty for an off-site event. Pick more than one if you need them together." : "No rooms can be booked yet. Ask the IAR office."}
              rooms={roomOptions}
              usedMost={p.usedMost}
              value={d.rooms}
              onChange={(ids) => set("rooms", ids)}
            />
            <div className="grid two">
              <Field label="Expected attendance">
                <input type="number" min={1} value={d.attendance} onChange={(e) => set("attendance", Number(e.target.value))} />
              </Field>
              <Field label="Budget estimate ($)">
                <input type="number" min={0} step={50} value={d.budget} onChange={(e) => set("budget", Number(e.target.value))} />
              </Field>
            </div>
            <Field label="Your setup plan (optional)">
              <input value={d.setupNotes} onChange={(e) => set("setupNotes", e.target.value)} placeholder="Tables, chairs, stage" maxLength={300} />
            </Field>
            <Choices legend="Details">
                {([
                  ["food", "Food served"],
                  ["isPublic", "Open to the public (needs marketing)"],
                  ["registration", "Registration needed"],
                  ["av", "A/V support"],
                  ["outsideSpeaker", "Outside speaker or guest"],
                  ["newProgram", "New program"],
                  ["fundraiser", "Fundraiser"],
                ] as const).map(([k, l]) => (
                  <Choice key={k} type="checkbox" checked={d[k]} onChange={(e) => set(k, e.target.checked)} label={l} />
                ))}
            </Choices>
          </div>
        </fieldset>

        {d.isPublic && (
          <fieldset className={styles.section} id="briefSect">
            <legend><span className={styles.sn}>{num("briefSect")}</span>Marketing</legend>
            <div className={styles.sectionBody}>
              <p className="hint">Marketing needs about 3 weeks: at least 2 to advertise, and a week or two before that to make the materials.</p>
              <Field label="One-line subtitle (5–6 words)" hint="Used on the flyer and in other marketing." required>
                <input required value={d.brief.subtitle} onChange={(e) => setBrief("subtitle", e.target.value)} maxLength={80} placeholder="A 5-Week Class on Fiqh · Sports Activities for Sisters" />
              </Field>
              <Field label="Announcement text to publish" hint="Marketing already has the date, time and room, and may edit the text for clarity." required>
                <textarea required rows={4} value={d.brief.text} onChange={(e) => setBrief("text", e.target.value)} maxLength={3000} placeholder={ANNOUNCE_EXAMPLE} />
              </Field>
              <Field label="Anything else the flyer or announcement must say (optional)">
                <textarea rows={2} value={d.brief.flyer} onChange={(e) => setBrief("flyer", e.target.value)} placeholder="Bring a water bottle, late registration cost, Q&A at the end" maxLength={1500} />
              </Field>
              {d.registration && (
                <Field label="Registration link and instructions" required>
                  <input required value={d.brief.regLink} onChange={(e) => setBrief("regLink", e.target.value)} placeholder="https://… and how to sign up" maxLength={500} />
                </Field>
              )}
              <Field label="Payment info and instructions (optional)">
                <textarea rows={2} value={d.brief.payment} onChange={(e) => setBrief("payment", e.target.value)} placeholder="Cost, how to pay, deadlines" maxLength={1000} />
              </Field>
              {p.uploads ? (
                <FileDrop
                  name="images"
                  label="Images for marketing (optional)"
                  hint={`Logos, photos of speakers or past events, artwork. Image files only (JPG, PNG, HEIC), no PDFs or Word documents. Up to ${MAX_PER_UPLOAD} files of ${MAX_FILE_MB} MB each; you can add more on the request page.`}
                  accept={IMAGE_ACCEPT}
                  maxFiles={MAX_PER_UPLOAD}
                  maxSizeMb={MAX_FILE_MB}
                  camera
                />
              ) : (
                <p className="hint">Image uploads for marketing aren&apos;t set up yet. After you send the request, share a Google Drive link in a comment on it.</p>
              )}
            </div>
          </fieldset>
        )}

        {d.av && (
          <fieldset className={styles.section} id="avSect">
            <legend><span className={styles.sn}>{num("avSect")}</span>A/V</legend>
            <div className={styles.sectionBody}>
              <Choices legend="What A/V support do you need? Check all that apply." required>
                {Object.entries(AV_KINDS).map(([k, l]) => (
                  <Choice key={k} type="checkbox" checked={d.avNeeds.kinds.includes(k)} onChange={() => update((x) => ({ ...x, avNeeds: { ...x.avNeeds, kinds: toggle(x.avNeeds.kinds, k) } }))} label={l} />
                ))}
              </Choices>
              <Choices legend="Will the event include any of these?">
                {Object.entries(AV_INCLUDES).map(([k, l]) => (
                  <Choice key={k} type="checkbox" checked={d.avNeeds.includes.includes(k)} onChange={() => update((x) => ({ ...x, avNeeds: { ...x.avNeeds, includes: toggle(x.avNeeds.includes, k) } }))} label={l} />
                ))}
              </Choices>
            </div>
          </fieldset>
        )}

        <fieldset className={styles.section} id="confirmSect">
          <legend><span className={styles.sn}>{num("confirmSect")}</span>Confirm</legend>
          <div className={styles.sectionBody}>
            <Field label="Notes for the teams (optional)">
              <textarea rows={2} value={d.teamNotes} onChange={(e) => set("teamNotes", e.target.value)} placeholder="Anything marketing or A/V should know" maxLength={1000} />
            </Field>
            <Checkbox required checked={d.agree} onChange={(e) => set("agree", e.target.checked)}>
              I&apos;ve read the{" "}
              {p.policyUrl ? (
              <a href={p.policyUrl} target="_blank" rel="noreferrer">
              room reservation policy
              </a>
              ) : (
              "room reservation policy"
              )}{" "}
              and accept its rules and liability statement.
              <RequiredTag />
            </Checkbox>
            {d.av && (
              <Checkbox required checked={d.avNeeds.ack} onChange={(e) => update((x) => ({ ...x, avNeeds: { ...x.avNeeds, ack: e.target.checked } }))}>I understand A/V support isn&apos;t guaranteed and the A/V team will contact me.<RequiredTag /></Checkbox>
            )}
            {d.isPublic && (
              <Checkbox required checked={d.brief.final} onChange={(e) => setBrief("final", e.target.checked)}>The details I&apos;ve given are final, so marketing can publish them.<RequiredTag /></Checkbox>
            )}
          </div>
        </fieldset>
        <FormActions>
          {blockers.length > 0 && !asking && <span className="hint">{clashOnly ? "The room is taken. Change the time or room, or ask for it." : "Fix the conflicts in the checks first."}</span>}
          <Button href={p.editing ? `/events/${p.editing}` : "/events"} variant="quiet">Cancel</Button>
          <Submit label={asking ? "Send and ask for the time" : p.submitLabel} disabled={blockers.length > 0 && !asking} />
        </FormActions>
      </form>

      <div className={styles.aside}>
        <Panel>
          <ol className={styles.steps}>
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>
                  <span className={s.done ? `${styles.sn} ${styles.done}` : styles.sn}>{s.done ? <Icon name="check" size="sm" label="Done" /> : i + 1}</span>
                  {s.n}
                </a>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Checks" right={summary ? <Pill tone={summary.tone} status>{checking ? "Checking…" : summary.label}</Pill> : undefined}>
          <div className="stack">
            <ChecksList checks={result.checks} />
            {result.clashes.map((c) => (
              <div key={c.key} className={styles.ask}>
                <div>
                  <strong>{c.label}</strong> has {c.roomName}, {timeText(c.start)}–{timeText(c.end)}
                  {c.dates.length > 1 ? ` on ${c.dates.length} dates (${c.dates.slice(0, 3).map(dayText).join(", ")}${c.dates.length > 3 ? "…" : ""})` : ` on ${dayText(c.dates[0])}`}.
                </div>
                {c.askable ? (
                  ask?.key === c.key ? (
                    <Field label="Why you need this time" hint="They can give it up or keep it. Director review waits for their answer.">
                      <textarea rows={3} value={ask.reason} onChange={(e) => setAsk({ key: c.key, reason: e.target.value })} placeholder="e.g. It's the only evening the speaker can come" maxLength={1000} />
                    </Field>
                  ) : (
                    <div>
                      <Button size="small" onClick={() => setAsk({ key: c.key, reason: "" })} disabled={result.clashes.length > 1 || !clashOnly}>Ask to use this time</Button>
                      {result.clashes.length > 1 && <div className="hint">Change the time or room so only one booking is in the way, then you can ask for it.</div>}
                    </div>
                  )
                ) : (
                  <div className="hint">{c.why}</div>
                )}
                {ask?.key === c.key && (
                  <div>
                    <Button size="small" variant="quiet" onClick={() => setAsk(null)}>Don&apos;t ask</Button>
                  </div>
                )}
              </div>
            ))}
            {askable.length === 0 && result.clashes.length > 0 && <p className="hint">Pick another time or room.</p>}
          </div>
        </Panel>
        <Panel title="IAR calendar that day" className={styles.calendarPanel}>
          {result.timelines.length > 0 ? (
            <div className="stack">
              {result.timelines.map((t, i) => (
                <Timeline key={t.roomName} items={t.items} request={t.request} caption={`${t.roomName} · ${dayText(t.date)}`} legend={i === result.timelines.length - 1} />
              ))}
            </div>
          ) : (
            <p className="hint">{d.rooms.length ? "Checking…" : "Off-site: nothing to check on the calendar."}</p>
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
      {pending ? "Sending…" : label}
    </Button>
  );
}
