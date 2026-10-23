import Link from "next/link";
import { notFound } from "next/navigation";
import { cardStore, STATUS_LABEL } from "@/lib/cards";
import { canOpenCard } from "@/lib/access";
import { actorFor } from "@/lib/people";
import { requireViewer } from "@/lib/viewer";
import { busyFor, eventActor, eventContext, mayBookRestricted } from "@/lib/events/context";
import { AV_INCLUDES, AV_KINDS } from "@/lib/events/input";
import { roomById } from "@/lib/events/rooms";
import { eventChecks, missionReasons, windowText } from "@/lib/events/rules";
import { dayText, longDate, recurText, timeText } from "@/lib/events/series";
import { CHOICE_LABEL, SLOT_STATUS_LABEL, type SlotRequest, canDecide, datesText, isOpenAsk } from "@/lib/events/slot-requests";
import { slotRequestStore } from "@/lib/events/slot-requests-store";
import { STAGE_LABEL, isEventCard, permission, reviewersFor, type EventAction } from "@/lib/events/workflow";
import { CommentsSection, Flash, HistoryList, fmtMoney } from "../../ui";
import { actOnEvent, actOnEventWith, commentOnEvent, decideAsk, withdrawAsk } from "../actions";
import { ChecksList } from "../ui";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  submitted: "Request submitted. It's held on the room calendar while it's reviewed. You can follow it here and in My Requests.",
  asked: "Request submitted, and the holder has been asked for the time. Your request waits for their answer.",
  resubmitted: "Changes saved and the request is back in review.",
  approve: "Approved.",
  return: "Sent back with your note. The room hold comes off the calendar until it's resubmitted.",
  deny: "Denied.",
  cancel: "Request cancelled and taken off the calendar.",
  decided: "Your answer is saved and both requests are updated.",
  withdrawn: "Ask withdrawn. Pick another time or room.",
  commented: "Comment added. The people on this request can see it.",
};

export default async function EventDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer();
  const card = await (await cardStore()).get(id);
  if (!isEventCard(card)) notFound();
  const slots = await slotRequestStore();
  const [actor, ev, ctx, fromAsks, onAsks] = await Promise.all([actorFor(viewer), Promise.resolve(eventActor(viewer)), eventContext(), slots.listFromCard(id), slots.listForHold(`card:${id}`)]);
  const asks: SlotRequest[] = [...onAsks, ...fromAsks.filter((a) => !onAsks.some((o) => o.id === a.id))];
  const deciding = asks.some((a) => canDecide(a, ev));
  // A request someone can't open looks the same as one that doesn't exist. Whoever is asked for their time can open the asking request.
  if (!canOpenCard(card, { ...actor, seeAll: viewer.roles.includes("admins") }) && !deciding) notFound();

  const ec = card;
  const e = card.event;
  const directors = ctx.directorsOf(e.committeeGroup);
  const can = (a: EventAction) => permission(card, ev, a, directors).ok;
  const own = card.ownerEmail === viewer.email.toLowerCase();
  const reviewing = can("approve");
  const live = reviewing ? eventChecks(e, { rooms: ctx.rooms, busy: await busyFor(ctx, e), today: ctx.today, rules: ctx.rules, mayBookRestricted: mayBookRestricted(viewer), excludeCard: card.id }) : null;
  const rooms = e.rooms.map((r) => roomById(ctx.rooms, r)?.name ?? r);
  const reasons = missionReasons(e);
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const base = (
    <>
      {hidden("id", card.id)}
      {hidden("expected", card.updatedAt)}
    </>
  );
  const statusText = card.status === "in_review" || card.status === "submitted" ? STAGE_LABEL[e.stage] : STATUS_LABEL[card.status];

  return (
    <>
      <p className="crumb">
        <Link href="/events">Events &amp; Rooms</Link>
      </p>
      <div className="pagehead">
        <div>
          <h1>{card.title}</h1>
          <p className="lead">
            {card.id} · {e.committeeName} · {e.recur ? `${recurText(e.date, e.recur)}, ${e.dates.length} dates` : dayText(e.date)}
          </p>
        </div>
        <div className="pills">
          <span className={`pill ${card.status}`}>{statusText}</span>
        </div>
      </div>
      <Flash ok={ok} error={error} messages={MESSAGES} />

      {card.status === "changes_requested" && (
        <div className="callout warn">
          <strong>{e.releasedFor ? "You gave up this time:" : "Sent back for changes:"}</strong> {e.returnNote}
          {own && can("resubmit") && (
            <>
              {" "}
              <Link href={`/events/${card.id}/edit`}>{e.releasedFor ? "Pick a new time" : "Edit and resubmit"}</Link>
            </>
          )}
        </div>
      )}
      {card.status === "denied" && e.returnNote && <div className="callout bad"><strong>Denied:</strong> {e.returnNote}</div>}
      {e.stage === "slot" && card.status === "submitted" && <div className="callout info">This request is waiting for an answer to an ask for a booked time (below). It goes to mission review once the time is given up.</div>}
      {reviewing && reasons.length > 0 && <div className="callout info">Look closely at this one: {reasons.join(", ")}.</div>}

      <div className="detail">
        <section>
          <dl className="facts">
            <div><dt>Requester</dt><dd>{e.agreed.name} <span className="sub">{card.ownerEmail}</span></dd></div>
            <div><dt>Committee</dt><dd>{e.committeeName}</dd></div>
            <div>
              <dt>When</dt>
              <dd>
                {e.recur ? `${recurText(e.date, e.recur)}, ${longDate(e.date)} to ${longDate(e.recur.until)}` : dayText(e.date)}
                <div className="sub">{timeText(e.start)}–{timeText(e.end)}; held {windowText(e)} with setup and cleanup</div>
                {(e.released ?? []).length > 0 && <div className="sub">Given up: {(e.released ?? []).map(dayText).join(", ")}</div>}
              </dd>
            </div>
            <div>
              <dt>Room</dt>
              <dd>
                {rooms.length ? rooms.join(", ") : "Off-site"}
                {e.holds.length > 0 && <div className="sub">{e.holds.some((h) => h.status === "tentative") ? "Held on the IAR calendar (pending approval)" : "Confirmed on the IAR calendar"}</div>}
              </dd>
            </div>
            <div><dt>Expected</dt><dd>{e.attendance} people{e.budget ? ` · budget ${fmtMoney(e.budget)}` : ""}</dd></div>
            <div>
              <dt>Details</dt>
              <dd>
                {[e.isPublic ? "Open to the public" : "Internal", e.food && "Food served", e.registration && "Registration", e.av && "A/V support", e.outsideSpeaker && "Outside speaker or guest", e.newProgram && "New program", e.fundraiser && "Fundraiser"].filter(Boolean).join(" · ")}
              </dd>
            </div>
            <div><dt>Now</dt><dd>{statusText}{card.waitingOn && <div className="sub">{card.waitingOn}</div>}</dd></div>
          </dl>

          <h2>About the event</h2>
          <div className="panel pre">{e.description}</div>
          {e.setupNotes && <p className="sub" style={{ marginTop: 8 }}>Setup plan: {e.setupNotes}</p>}

          {e.isPublic && e.brief && (
            <>
              <h2>For marketing</h2>
              <dl className="facts">
                <div><dt>Subtitle</dt><dd>{e.brief.subtitle}</dd></div>
                <div><dt>Start marketing</dt><dd>{e.brief.startOn ? dayText(e.brief.startOn) : "—"}</dd></div>
                <div style={{ gridColumn: "1 / -1" }}><dt>Announcement</dt><dd className="pre">{e.brief.text}</dd></div>
                {e.brief.flyer && <div style={{ gridColumn: "1 / -1" }}><dt>Also on the flyer</dt><dd className="pre">{e.brief.flyer}</dd></div>}
                {e.brief.regLink && <div><dt>Registration</dt><dd>{e.brief.regLink}</dd></div>}
                {e.brief.payment && <div><dt>Payment</dt><dd className="pre">{e.brief.payment}</dd></div>}
                {e.brief.files && <div><dt>Files</dt><dd><a href={e.brief.files} target="_blank" rel="noreferrer">Drive folder</a></dd></div>}
              </dl>
            </>
          )}
          {e.av && e.avNeeds && (
            <>
              <h2>For A/V</h2>
              <p>{e.avNeeds.kinds.map((k) => AV_KINDS[k]).join(", ") || "Support requested"}{e.avNeeds.includes.length > 0 && <span className="sub"> · Includes: {e.avNeeds.includes.map((k) => AV_INCLUDES[k]).join(", ")}</span>}</p>
            </>
          )}
          {e.teamNotes && <p className="sub">Notes for the teams: {e.teamNotes}</p>}

          {asks.length > 0 && (
            <>
              <h2 id="asks">Asks for a booked time</h2>
              {asks.map((a) => (
                <AskPanel key={a.id} ask={a} cardId={card.id} />
              ))}
            </>
          )}

          <h2>{live ? "Checks now" : "Checks when it was submitted"}</h2>
          <div className="panel">
            <ChecksList checks={live ? live.checks : e.checks} />
            {live && live.clashes.some((c) => c.kind !== "pending") && <p className="note" style={{ marginTop: 8 }}>Something was booked in this room since it was submitted. Send it back so the requester can pick another time.</p>}
          </div>
        </section>

        <aside>
          <Actions />
          <CommentsSection id={card.id} comments={card.comments} action={commentOnEvent} />
          <h2>History</h2>
          <HistoryList entries={e.history} />
        </aside>
      </div>
    </>
  );

  function Actions() {
    const cancel = can("cancel");
    if (!reviewing && !cancel) {
      if (ec.status !== "in_review" || own) return null;
      const why = permission(ec, ev, "approve", directors);
      return !why.ok ? <div className="panel sub">{why.reason}{e.stage === "director" && reviewersFor(ec.ownerEmail, directors).length ? ` (${reviewersFor(ec.ownerEmail, directors).join(", ")})` : ""}</div> : null;
    }
    return (
      <div className="panel actions">
        {reviewing && (
          <>
            <h3>{STAGE_LABEL[e.stage]}</h3>
            <form action={actOnEvent} className="stack">
              {base}
              <label className="field">
                <span>Note (required to send back or deny)</span>
                <textarea name="note" rows={2} maxLength={1000} />
              </label>
              <div className="row">
                <button className="button" formAction={actOnEventWith.bind(null, "approve")} type="submit">Approve</button>
                <button className="button secondary" formAction={actOnEventWith.bind(null, "return")} type="submit">Send back</button>
                <button className="button secondary danger" formAction={actOnEventWith.bind(null, "deny")} type="submit">Deny</button>
              </div>
            </form>
          </>
        )}
        {cancel && (
          <form action={actOnEvent} className="cancelform">
            {base}
            {hidden("action", "cancel")}
            <button className="linkbtn danger" type="submit">Cancel this request{e.holds.length ? " and free the room" : ""}</button>
          </form>
        )}
      </div>
    );
  }

  function AskPanel({ ask: a, cardId }: { ask: SlotRequest; cardId: string }) {
    const mine = a.requesterEmail === viewer.email.toLowerCase();
    const decide = canDecide(a, ev);
    const holderIsThis = a.hold.cardId === cardId;
    const slot = `${a.hold.room}, ${datesText(a.dates)}, ${timeText(a.hold.start)}–${timeText(a.hold.end)}`;
    return (
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>{holderIsThis ? `${a.requesterName} asks for ${slot}` : `${mine ? "You" : a.requesterName} asked for ${slot}, held by ${a.hold.label}`}</strong>
          <span className={`pill ${isOpenAsk(a) ? "submitted" : a.status === "released" ? "approved" : "denied"}`}>{SLOT_STATUS_LABEL[a.status]}</span>
        </div>
        <p className="sub">{a.id} · for <Link href={`/events/${a.fromCard}`}>{a.fromCard}</Link> · Reason: “{a.reason}”{a.choice ? ` · Answer: ${CHOICE_LABEL[a.choice]}${a.note ? ` (“${a.note}”)` : ""}` : ""}</p>
        {decide && (
          <form action={decideAsk} className="stack">
            {hidden("ask", a.id)}
            {hidden("back", `/events/${cardId}`)}
            <label className="field">
              <span>Note for {a.requesterName} (optional)</span>
              <input name="note" maxLength={1000} placeholder="e.g. We can move to the following week" />
            </label>
            <div className="row">
              {a.hold.cardId && <button className="button" type="submit" name="choice" value="release_move">Give it up and move {a.hold.ownerEmail === viewer.email.toLowerCase() ? "my" : "the"} event</button>}
              <button className={`button${a.hold.cardId ? " secondary" : ""}`} type="submit" name="choice" value="release_cancel">Give it up and cancel {a.dates.length > 1 ? "those dates" : "it"}</button>
              <button className="button secondary" type="submit" name="choice" value="keep">Keep it</button>
            </div>
            {a.status === "escalated" && <p className="note">Nobody answered for 6 days, so it&apos;s yours to decide. The history records that you decided for them.</p>}
          </form>
        )}
        {mine && isOpenAsk(a) && (
          <form action={withdrawAsk}>
            {hidden("ask", a.id)}
            <button className="linkbtn" type="submit">Withdraw the ask</button>
          </form>
        )}
        <details>
          <summary className="sub">History</summary>
          <ol className="history">
            {a.history.map((h, i) => <li key={i}><div className="sub">{h.text}</div></li>)}
          </ol>
        </details>
      </div>
    );
  }
}
