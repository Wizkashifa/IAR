import Link from "next/link";
import { notFound } from "next/navigation";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { actorFor } from "@/lib/people";
import { todayLocal } from "@/lib/away";
import { MARKETING_TYPES, answerText, neededBy } from "@/lib/marketing/forms";
import { canViewMarketing } from "@/lib/marketing/access";
import { STAGE_LABEL, daysUntilNeeded, isMarketingCard, isTight, permission, suggestedDoneBy, type Action } from "@/lib/marketing/workflow";
import { CommentsSection, Flash, HistoryList, fmtDate, fmtDay } from "../../ui";
import { actOnMarketing, commentOnMarketing } from "../actions";
import { OK_MESSAGES, StagePill } from "../ui";

export const dynamic = "force-dynamic";

export default async function MarketingDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer();
  const [card, actor] = await Promise.all([(await cardStore()).get(id), actorFor(viewer)]);
  // A request someone can't open looks the same as one that doesn't exist.
  if (!isMarketingCard(card) || !canViewMarketing(card, { ...actor, seeAll: viewer.roles.includes("admins") })) notFound();

  const mc = card;
  const m = card.marketing;
  const t = MARKETING_TYPES[m.kind];
  const today = todayLocal();
  const can = (a: Action) => permission(mc, actor, a).ok;
  const own = card.ownerEmail.toLowerCase() === viewer.email.toLowerCase();
  const due = neededBy(m.answers);
  const days = daysUntilNeeded(mc, today);
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const base = (action: Action) => (
    <>
      {hidden("id", card.id)}
      {hidden("expected", card.updatedAt)}
      {hidden("action", action)}
    </>
  );

  return (
    <>
      <p className="crumb">
        <Link href="/marketing">Marketing Requests</Link>
      </p>
      <div className="pagehead">
        <div>
          <h1>{card.title}</h1>
          <p className="lead">
            {card.id} · {t.label} · {card.committee}
          </p>
        </div>
        <div className="pills">
          <StagePill card={card} />
        </div>
      </div>
      <Flash ok={ok} error={error} messages={OK_MESSAGES} />

      {m.stage === "question" && m.question && (
        <div className="callout warn">
          <strong>Marketing asked:</strong> <span className="pre">{m.question}</span>
          {own && (
            <>
              {" "}
              <Link href={`/marketing/${card.id}/edit`}>Answer and edit the request</Link>
            </>
          )}
        </div>
      )}
      {m.stage === "declined" && m.declineReason && (
        <div className="callout bad">
          <strong>Declined:</strong> <span className="pre">{m.declineReason}</span>
        </div>
      )}
      {m.stage === "done" && m.doneNote && (
        <div className="callout info">
          <strong>Done:</strong> <span className="pre">{m.doneNote}</span>
        </div>
      )}
      {isTight(mc, today) && days !== null && (
        <div className="callout warn">
          {days === 0 ? "Needed today." : `Needed in ${days} day${days === 1 ? "" : "s"}.`} Marketing usually takes 1–2 weeks, so this may not be ready in time.
        </div>
      )}

      <div className="detail">
        <section>
          <dl className="facts">
            <div><dt>Requested by</dt><dd>{m.requesterName} <span className="sub">{card.ownerEmail}</span></dd></div>
            <div><dt>Committee</dt><dd>{card.committee}</dd></div>
            <div><dt>Type</dt><dd>{t.label}</dd></div>
            <div><dt>Submitted</dt><dd>{fmtDate(card.createdAt ?? m.history[0]?.at ?? card.updatedAt)}</dd></div>
            {due && <div><dt>Needed by</dt><dd>{fmtDay(due)}</dd></div>}
            {m.doneBy && m.stage !== "declined" && <div><dt>{m.stage === "done" ? "Was due" : "Marketing aims to finish"}</dt><dd>{fmtDay(m.doneBy)}</dd></div>}
            {m.assignee && <div><dt>Worked on by</dt><dd>{m.assignee}</dd></div>}
            <div>
              <dt>Now</dt>
              <dd>
                {STAGE_LABEL[m.stage]}
                {card.waitingOn && <div className="sub">{card.waitingOn}</div>}
              </dd>
            </div>
          </dl>

          <h2>The request</h2>
          <dl className="answers">
            {t.fields.map((f) => {
              const v = m.answers[f.key];
              if (!v) return null;
              return (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd className="pre">
                    {f.kind === "url" ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : f.kind === "date" ? fmtDay(v) : answerText(f, v)}
                  </dd>
                </div>
              );
            })}
            <div>
              <dt>Files</dt>
              <dd>{m.driveLink ? <a href={m.driveLink} target="_blank" rel="noreferrer">{m.driveLink}</a> : <span className="sub">No Drive link</span>}</dd>
            </div>
            {m.notes && (
              <div>
                <dt>Comments from the requester</dt>
                <dd className="pre">{m.notes}</dd>
              </div>
            )}
          </dl>
          {own && can("edit") && m.stage === "review" && (
            <p className="note">
              Need to change something? <Link href={`/marketing/${card.id}/edit`}>Edit the request</Link> until marketing schedules it.
            </p>
          )}
        </section>

        <aside>
          <Actions />
          <CommentsSection id={card.id} comments={card.comments} action={commentOnMarketing} />
          <h2>History</h2>
          <HistoryList entries={m.history} />
        </aside>
      </div>
    </>
  );

  function Actions() {
    const schedule = can("schedule");
    const ask = can("ask");
    const decline = can("decline");
    const start = can("start");
    const finish = can("finish");
    const reschedule = can("reschedule");
    const answer = can("answer");
    const cancel = can("cancel");
    // Say why a marketing member can't review this one (their own request).
    const why = m.stage === "review" && actor.roles.includes("marketing") ? permission(mc, actor, "schedule") : null;
    const whyNot = why && !why.ok ? why.reason : null;
    if (!schedule && !ask && !decline && !start && !finish && !reschedule && !answer && !cancel) {
      return whyNot ? <div className="panel sub">{whyNot}</div> : null;
    }
    return (
      <div className="panel actions">
        {whyNot && <p className="note">{whyNot}</p>}
        {schedule && (
          <>
            <h3>Weekly review</h3>
            <form action={actOnMarketing} className="stack">
              {base("schedule")}
              <label className="field">
                <span>Marketing aims to finish by</span>
                <input type="date" name="doneBy" defaultValue={suggestedDoneBy(mc, today)} min={today} required />
              </label>
              <label className="field">
                <span>Note for the requester (optional)</span>
                <input name="note" maxLength={2000} />
              </label>
              <div>
                <button className="button" type="submit">Schedule</button>
              </div>
            </form>
          </>
        )}
        {ask && (
          <>
            <h3>Ask a question</h3>
            <form action={actOnMarketing} className="stack">
              {base("ask")}
              <label className="field">
                <span>Your question for {m.requesterName}</span>
                <textarea name="note" rows={2} maxLength={2000} required placeholder="e.g. Which size: banner or poster?" />
              </label>
              <div>
                <button className="button secondary" type="submit">Send question</button>
              </div>
            </form>
          </>
        )}
        {start && (
          <>
            <h3>Scheduled</h3>
            <form action={actOnMarketing} className="stack">
              {base("start")}
              <p className="note">Starting it records you as the one working on it.</p>
              <div>
                <button className="button" type="submit">Start</button>
              </div>
            </form>
          </>
        )}
        {finish && (
          <>
            <h3>{m.stage === "doing" ? "In progress" : "Finished already?"}</h3>
            <form action={actOnMarketing} className="stack">
              {base("finish")}
              <label className="field">
                <span>Link to the finished work, or a note (optional)</span>
                <input name="note" maxLength={2000} />
              </label>
              <div>
                <button className={m.stage === "doing" ? "button" : "button secondary"} type="submit">Mark done</button>
              </div>
            </form>
          </>
        )}
        {reschedule && (
          <>
            <h3>Change the done-by date</h3>
            <form action={actOnMarketing} className="stack">
              {base("reschedule")}
              <label className="field">
                <span>New date</span>
                <input type="date" name="doneBy" defaultValue={m.doneBy} min={today} required />
              </label>
              <label className="field">
                <span>Why (optional, the requester sees it)</span>
                <input name="note" maxLength={2000} />
              </label>
              <div>
                <button className="button secondary" type="submit">Change date</button>
              </div>
            </form>
          </>
        )}
        {decline && (
          <>
            <h3>Decline</h3>
            <form action={actOnMarketing} className="stack">
              {base("decline")}
              <label className="field">
                <span>Why marketing can&apos;t take this on</span>
                <textarea name="note" rows={2} maxLength={2000} required />
              </label>
              <div>
                <button className="button secondary danger" type="submit">Decline</button>
              </div>
            </form>
          </>
        )}
        {answer && (
          <>
            <h3>Answer marketing&apos;s question</h3>
            <form action={actOnMarketing} className="stack">
              {base("answer")}
              <label className="field">
                <span>Your answer</span>
                <textarea name="note" rows={3} maxLength={2000} required />
              </label>
              <div className="row">
                <button className="button" type="submit">Send answer</button>
                <Link href={`/marketing/${mc.id}/edit`} className="button secondary">Edit the request too</Link>
              </div>
            </form>
          </>
        )}
        {cancel && (
          <form action={actOnMarketing} className="cancelform">
            {base("cancel")}
            <button className="linkbtn danger" type="submit">Cancel this request</button>
          </form>
        )}
      </div>
    );
  }
}
