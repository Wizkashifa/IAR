"use client";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { AV_INCLUDES, AV_KINDS } from "@/lib/events/input";
import { RECUR_LABEL, dayText, longDate, seriesMaxEnd, timeText, SERIES_MAX_MONTHS } from "@/lib/events/series";
import type { AvNeeds, EventInput, MarketingBrief, RecurFreq } from "@/lib/events/types";
import { type DraftCheck, type EventFormState, checkDraft } from "./actions";
import { ChecksList, Timeline } from "./ui";

export type RoomChoice = { id: string; name: string; capacity: number; building: string; food: boolean };

export type EventFormProps = {
  action: (prev: EventFormState, form: FormData) => Promise<EventFormState>;
  committees: { group: string; name: string }[];
  rooms: RoomChoice[];
  initial?: EventInput;
  /** Resubmitting this request: its own holds don't count as clashes. */
  editing?: string;
  /** Moved to give up its time: say so. */
  moved?: boolean;
  /** Renewing this series: the next period of it. */
  renews?: { id: string; until: string };
  today: string;
  submitLabel: string;
};

type Draft = Omit<EventInput, "recur" | "brief" | "avNeeds"> & { recurFreq: RecurFreq | "none"; recurUntil: string; brief: MarketingBrief; avNeeds: AvNeeds; agree: boolean };

const blankBrief = (): MarketingBrief => ({ subtitle: "", text: "", flyer: "", regLink: "", payment: "", startOn: "", files: "", final: false });
const blankAv = (): AvNeeds => ({ kinds: [], includes: [], ack: false });
const ANNOUNCE_EXAMPLE = "Join us for a family game night with dinner, board games and a trivia round. All families are welcome.";

function initialDraft(p: EventFormProps): Draft {
  const i = p.initial;
  const plus = (n: number) => {
    const d = new Date(`${p.today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  return {
    title: i?.title ?? "",
    description: i?.description ?? "",
    committeeGroup: i?.committeeGroup ?? p.committees[0]?.group ?? "",
    committeeName: i?.committeeName ?? p.committees[0]?.name ?? "",
    date: i?.date ?? plus(21),
    start: i?.start ?? "18:30",
    end: i?.end ?? "20:00",
    setup: i?.setup ?? 30,
    teardown: i?.teardown ?? 30,
    recurFreq: i?.recur?.freq ?? "none",
    recurUntil: i?.recur?.until ?? "",
    rooms: i?.rooms ?? [],
    attendance: i?.attendance ?? 20,
    budget: i?.budget ?? 0,
    food: i?.food ?? false,
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

export default function EventForm(p: EventFormProps) {
  const [state, formAction] = useActionState(p.action, { errors: [] });
  const [d, setD] = useState<Draft>(() => initialDraft(p));
  const [result, setResult] = useState<DraftCheck>({ checks: [], clashes: [], timeline: null });
  const [checking, startCheck] = useTransition();
  const [ask, setAsk] = useState<{ key: string; reason: string } | null>(null);
  const seq = useRef(0);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setBrief = <K extends keyof MarketingBrief>(k: K, v: MarketingBrief[K]) => setD((x) => ({ ...x, brief: { ...x.brief, [k]: v } }));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // A series always has an end date: fill in the longest allowed until the requester picks one.
  useEffect(() => {
    if (d.recurFreq !== "none" && d.date && !d.recurUntil) set("recurUntil", seriesMaxEnd(d.date));
  }, [d.recurFreq, d.date, d.recurUntil]);

  // The checks the reviewers will see, run against the room calendars as the requester types.
  const checkKey = JSON.stringify([d.date, d.start, d.end, d.setup, d.teardown, d.recurFreq, d.recurUntil, d.rooms, d.attendance, d.budget, d.food, d.isPublic, d.registration, d.av, d.newProgram, d.outsideSpeaker, d.fundraiser, d.description.length > 199, Boolean(d.description), d.brief.subtitle, d.brief.text, d.brief.startOn, d.brief.regLink, d.avNeeds.kinds, d.committeeGroup]);
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
    ...(d.isPublic ? [{ id: "briefSect", n: "Marketing", done: Boolean(d.brief.subtitle && d.brief.text && d.brief.startOn) }] : []),
    ...(d.av ? [{ id: "avSect", n: "A/V", done: d.avNeeds.kinds.length > 0 }] : []),
    { id: "confirmSect", n: "Confirm", done: d.agree && (!d.av || d.avNeeds.ack) && (!d.isPublic || d.brief.final) },
  ];
  const num = (id: string) => sections.findIndex((s) => s.id === id) + 1;
  const max = d.date ? seriesMaxEnd(d.date) : "";
  const summary = result.checks.some((c) => c.sev === "bad") ? ["denied", "Conflict"] : result.checks.some((c) => c.sev === "warn") ? ["changes_requested", "Flags to review"] : result.checks.length ? ["approved", "All clear"] : null;

  return (
    <div className="evgrid">
      <form action={formAction} className="form" style={{ marginTop: 0 }}>
        <input type="hidden" name="payload" value={JSON.stringify(payload)} />
        {p.renews && <div className="callout info">The next period of {p.renews.id}, which ends {longDate(p.renews.until)}. It goes through the same checks and approval as any new request.</div>}
        {p.moved && <div className="callout info">You gave up this event&apos;s time to someone else&apos;s request. Pick a new time; only the director needs to approve it.</div>}
        {state.errors.length > 0 && (
          <div className="error" role="alert">
            Please fix:
            <ul>{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        <fieldset className="section" id="evSect">
          <legend><span className="sn">{num("evSect")}</span>Event and room</legend>
          <label className="field">
            <span>Program title</span>
            <input value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={120} required />
          </label>
          <label className="field">
            <span>Tell us about the event</span>
            <textarea rows={5} value={d.description} onChange={(e) => set("description", e.target.value)} placeholder="What will happen and who it's for. Include the schedule and any speakers or guests." maxLength={4000} required />
            <small className={d.description.trim().length >= 200 ? "ok" : ""}>
              {d.description.trim().length} characters. {d.description.trim().length >= 200 ? "That gives reviewers and the teams what they need." : "A few sentences (200+ characters) helps reviewers approve faster."}
            </small>
          </label>
          <div className="grid2" style={{ marginTop: 12 }}>
            <label className="field">
              <span>Sponsoring committee</span>
              <select value={d.committeeGroup} onChange={(e) => setD((x) => ({ ...x, committeeGroup: e.target.value, committeeName: p.committees.find((c) => c.group === e.target.value)?.name ?? "" }))}>
                {p.committees.map((c) => <option key={c.group} value={c.group}>{c.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{d.recurFreq !== "none" ? "First date" : "Date"}</span>
              <input type="date" value={d.date} min={p.today} onChange={(e) => set("date", e.target.value)} required />
            </label>
            <label className="field">
              <span>Event starts</span>
              <input type="time" step={900} value={d.start} onChange={(e) => set("start", e.target.value)} required />
            </label>
            <label className="field">
              <span>Event ends</span>
              <input type="time" step={900} value={d.end} onChange={(e) => set("end", e.target.value)} required />
            </label>
            <label className="field">
              <span>Setup before (minutes)</span>
              <input type="number" min={0} max={240} step={15} value={d.setup} onChange={(e) => set("setup", Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Cleanup after (minutes)</span>
              <input type="number" min={0} max={240} step={15} value={d.teardown} onChange={(e) => set("teardown", Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Repeats</span>
              <select value={d.recurFreq} onChange={(e) => setD((x) => ({ ...x, recurFreq: e.target.value as Draft["recurFreq"], recurUntil: e.target.value === "none" ? "" : x.recurUntil }))}>
                <option value="none">Does not repeat</option>
                {(Object.keys(RECUR_LABEL) as RecurFreq[]).map((k) => <option key={k} value={k}>{RECUR_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Repeats until</span>
              <input type="date" value={d.recurUntil} min={d.date} max={max} disabled={d.recurFreq === "none"} onChange={(e) => set("recurUntil", e.target.value)} />
              <small>{d.recurFreq === "none" ? "Only for repeating events." : `Required. No later than ${longDate(max)} (${SERIES_MAX_MONTHS} months). Request the next period when it ends.`}</small>
            </label>
          </div>
          <p className="note" style={{ marginTop: 8 }}>You set up and clean up yourselves. That time is held on the calendar for you.</p>
          <div className="field" style={{ marginTop: 12 }}>
            <span>Room or rooms (leave empty for an off-site event)</span>
            <div className="roompick">
              {p.rooms.map((r) => (
                <label key={r.id}>
                  <input type="checkbox" checked={d.rooms.includes(r.id)} onChange={() => set("rooms", toggle(d.rooms, r.id))} />
                  {r.name}
                  {r.capacity ? <span className="sub">({r.capacity})</span> : null}
                </label>
              ))}
            </div>
            {p.rooms.length === 0 && <small>No rooms are set up for booking yet. An admin turns rooms on in Portal Settings.</small>}
          </div>
          <div className="grid2" style={{ marginTop: 12 }}>
            <label className="field">
              <span>Expected attendance</span>
              <input type="number" min={1} value={d.attendance} onChange={(e) => set("attendance", Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Budget estimate ($)</span>
              <input type="number" min={0} step={50} value={d.budget} onChange={(e) => set("budget", Number(e.target.value))} />
            </label>
          </div>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Your setup plan (optional)</span>
            <input value={d.setupNotes} onChange={(e) => set("setupNotes", e.target.value)} placeholder="Tables, chairs, stage" maxLength={300} />
          </label>
          <div className="field" style={{ marginTop: 12 }}>
            <span>Details</span>
            <div className="choices">
              {([
                ["food", "Food served"],
                ["isPublic", "Open to the public (needs marketing)"],
                ["registration", "Registration needed"],
                ["av", "A/V support"],
                ["outsideSpeaker", "Outside speaker or guest"],
                ["newProgram", "New program"],
                ["fundraiser", "Fundraiser"],
              ] as const).map(([k, l]) => (
                <label key={k} className={`choice${d[k] ? " on" : ""}`}>
                  <input type="checkbox" checked={d[k]} onChange={(e) => set(k, e.target.checked)} /> {l}
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        {d.isPublic && (
          <fieldset className="section" id="briefSect">
            <legend><span className="sn">{num("briefSect")}</span>Marketing</legend>
            <p className="note">Marketing needs about 3 weeks: at least 2 to advertise, and a week or two before that to make the materials.</p>
            <label className="field">
              <span>One-line subtitle (5–6 words)</span>
              <input value={d.brief.subtitle} onChange={(e) => setBrief("subtitle", e.target.value)} maxLength={80} placeholder="A 5-Week Class on Fiqh · Sports Activities for Sisters" />
              <small>Used on the flyer and in other marketing.</small>
            </label>
            <label className="field">
              <span>Announcement text to publish</span>
              <textarea rows={4} value={d.brief.text} onChange={(e) => setBrief("text", e.target.value)} maxLength={3000} />
              <small>Example: {ANNOUNCE_EXAMPLE} Marketing already has the date, time and room, and may edit the text for clarity.</small>
            </label>
            <label className="field">
              <span>Anything else the flyer or announcement must say (optional)</span>
              <textarea rows={2} value={d.brief.flyer} onChange={(e) => setBrief("flyer", e.target.value)} placeholder="Bring a water bottle, late registration cost, Q&A at the end" maxLength={1500} />
            </label>
            {d.registration && (
              <label className="field">
                <span>Registration link and instructions</span>
                <input value={d.brief.regLink} onChange={(e) => setBrief("regLink", e.target.value)} placeholder="https://… and how to sign up" maxLength={500} />
              </label>
            )}
            <label className="field">
              <span>Payment info and instructions (if any)</span>
              <textarea rows={2} value={d.brief.payment} onChange={(e) => setBrief("payment", e.target.value)} placeholder="Cost, how to pay, deadlines" maxLength={1000} />
            </label>
            <div className="grid2" style={{ marginTop: 12 }}>
              <label className="field">
                <span>Start marketing on</span>
                <input type="date" value={d.brief.startOn} min={p.today} max={d.date} onChange={(e) => setBrief("startOn", e.target.value)} />
                <small>At least 2 weeks before the event.</small>
              </label>
              <label className="field">
                <span>Google Drive link to files (optional)</span>
                <input type="url" value={d.brief.files} onChange={(e) => setBrief("files", e.target.value)} placeholder="https://drive.google.com/…" maxLength={500} />
                <small>Logos, photos, speaker bios. Share with everyone at IAR.</small>
              </label>
            </div>
          </fieldset>
        )}

        {d.av && (
          <fieldset className="section" id="avSect">
            <legend><span className="sn">{num("avSect")}</span>A/V</legend>
            <p className="note">The A/V team will contact you about what they can support.</p>
            <div className="field">
              <span>What A/V support do you need? Check all that apply.</span>
              <div className="choices">
                {Object.entries(AV_KINDS).map(([k, l]) => (
                  <label key={k} className={`choice${d.avNeeds.kinds.includes(k) ? " on" : ""}`}>
                    <input type="checkbox" checked={d.avNeeds.kinds.includes(k)} onChange={() => setD((x) => ({ ...x, avNeeds: { ...x.avNeeds, kinds: toggle(x.avNeeds.kinds, k) } }))} /> {l}
                  </label>
                ))}
              </div>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <span>Will the event include any of these?</span>
              <div className="choices">
                {Object.entries(AV_INCLUDES).map(([k, l]) => (
                  <label key={k} className={`choice${d.avNeeds.includes.includes(k) ? " on" : ""}`}>
                    <input type="checkbox" checked={d.avNeeds.includes.includes(k)} onChange={() => setD((x) => ({ ...x, avNeeds: { ...x.avNeeds, includes: toggle(x.avNeeds.includes, k) } }))} /> {l}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
        )}

        <fieldset className="section" id="confirmSect">
          <legend><span className="sn">{num("confirmSect")}</span>Confirm</legend>
          <label className="field">
            <span>Notes for the teams (optional)</span>
            <textarea rows={2} value={d.teamNotes} onChange={(e) => set("teamNotes", e.target.value)} placeholder="Anything marketing, A/V or security should know" maxLength={1000} />
          </label>
          <div className="checks">
            <label className="inline">
              <input type="checkbox" checked={d.agree} onChange={(e) => set("agree", e.target.checked)} /> I&apos;ve read the room reservation policy and accept its rules and liability statement.
            </label>
            {d.av && (
              <label className="inline">
                <input type="checkbox" checked={d.avNeeds.ack} onChange={(e) => setD((x) => ({ ...x, avNeeds: { ...x.avNeeds, ack: e.target.checked } }))} /> I understand A/V support isn&apos;t guaranteed and the A/V team will contact me.
              </label>
            )}
            {d.isPublic && (
              <label className="inline">
                <input type="checkbox" checked={d.brief.final} onChange={(e) => setBrief("final", e.target.checked)} /> The details I&apos;ve given are final, so marketing can publish them.
              </label>
            )}
          </div>
        </fieldset>
        <div className="row">
          <Submit label={asking ? "Submit and ask for the time" : p.submitLabel} disabled={blockers.length > 0 && !asking} />
          {blockers.length > 0 && !asking && <span className="sub">{clashOnly ? "The room is taken. Change the time or room, or ask for it." : "Fix the conflicts in the checks first."}</span>}
        </div>
      </form>

      <div className="sticky">
        <div className="panel">
          <ol className="stack" style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`}><span className="sn">{s.done ? "✓" : i + 1}</span>{s.n}</a>
              </li>
            ))}
          </ol>
        </div>
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Checks</h3>
            {summary && <span className={`pill ${summary[0]}`}>{checking ? "Checking…" : summary[1]}</span>}
          </div>
          <div style={{ marginTop: 10 }}>
            <ChecksList checks={result.checks} />
          </div>
          {result.clashes.map((c) => (
            <div key={c.key} className="askbox">
              <strong>{c.label}</strong> has {c.roomName}, {timeText(c.start)}–{timeText(c.end)}
              {c.dates.length > 1 ? ` on ${c.dates.length} dates (${c.dates.slice(0, 3).map(dayText).join(", ")}${c.dates.length > 3 ? "…" : ""})` : ` on ${dayText(c.dates[0])}`}.
              {c.askable ? (
                ask?.key === c.key ? (
                  <label className="field" style={{ marginTop: 8 }}>
                    <span>Why you need this time</span>
                    <textarea rows={3} value={ask.reason} onChange={(e) => setAsk({ key: c.key, reason: e.target.value })} placeholder="e.g. It's the only evening the speaker can come" maxLength={1000} />
                    <small>
                      They can give it up or keep it. Your request waits for the answer before mission review. <button type="button" className="linkbtn" onClick={() => setAsk(null)}>Don&apos;t ask</button>
                    </small>
                  </label>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    <button type="button" className="button secondary" onClick={() => setAsk({ key: c.key, reason: "" })} disabled={result.clashes.length > 1 || !clashOnly}>Ask to use this time</button>
                    {result.clashes.length > 1 && <div className="sub">Change the time or room so only one booking is in the way, then you can ask for it.</div>}
                  </div>
                )
              ) : (
                <div className="sub">{c.why}</div>
              )}
            </div>
          ))}
          {askable.length === 0 && result.clashes.length > 0 && <p className="note" style={{ marginTop: 8 }}>Pick another time or room.</p>}
        </div>
        <div className="panel">
          <h3 style={{ margin: 0 }}>IAR calendar that day</h3>
          {result.timeline ? (
            <Timeline items={result.timeline.items} request={result.timeline.request} caption={`${result.timeline.roomName} · ${dayText(result.timeline.date)}`} />
          ) : (
            <p className="note">{d.rooms.length ? "Checking…" : "Off-site: nothing to check on the calendar."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Submit({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending || disabled}>
      {pending ? "Submitting…" : label}
    </button>
  );
}
