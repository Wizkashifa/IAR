import Link from "next/link";
import { notFound } from "next/navigation";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { canViewTicket } from "@/lib/tickets/access";
import { teamMembers, ticketActor } from "@/lib/tickets/context";
import { KIND_LABEL, TEAM_NAME, URGENCY } from "@/lib/tickets/types";
import { type Action, isOpen, isTicketCard, isWatching, onTeam, permission } from "@/lib/tickets/workflow";
import { CommentsSection, Flash, HistoryList } from "../../ui";
import { actOnTicket, actOnTicketWith, addTicketPhotos, commentOnTicket, watchTicket } from "../actions";
import { FLASH, TicketStatusPill, UrgencyTag, fmtDate, fmtDateTime, fmtDay } from "../ui";

export const dynamic = "force-dynamic";

export default async function TicketDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const card = await (await cardStore()).get(id);
  // A ticket someone can't open looks the same as one that doesn't exist.
  if (!isTicketCard(card) || !canViewTicket(card, { ...actor, seeAll: viewer.roles.includes("admins") })) notFound();

  const t = card.ticket;
  const tc = card;
  const can = (a: Action) => permission(tc, actor, a).ok;
  const own = card.ownerEmail.toLowerCase() === actor.email;
  const preventive = t.kind === "preventive";
  const members = can("assign") ? (await teamMembers())[t.team] : [];
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const base = (
    <>
      {hidden("id", card.id)}
      {hidden("expected", card.updatedAt)}
    </>
  );

  return (
    <>
      <p className="crumb">
        <Link href="/it-maintenance">IT &amp; Maintenance</Link>
      </p>
      <div className="pagehead">
        <div>
          <h1>{card.title}</h1>
          <p className="lead">
            {card.id} · {TEAM_NAME[t.team]} · {KIND_LABEL[t.kind]}
          </p>
        </div>
        <div className="pills">
          <UrgencyTag urgency={t.urgency} />
          <TicketStatusPill status={t.status} />
        </div>
      </div>
      <Flash ok={ok} error={error} messages={FLASH} />

      {t.status === "resolved" && (
        <div className="callout info">
          <strong>Marked fixed:</strong> {t.resolutionNote}
          {own ? " Check it, then confirm below, or say it's not fixed and it goes back to the team." : " Waiting for the reporter to confirm. It closes by itself in 7 days if they don't reopen it."}
        </div>
      )}
      {t.status === "reopened" && t.reopenNote && (
        <div className="callout warn">
          <strong>Reopened:</strong> {t.reopenNote}
        </div>
      )}
      {t.status === "closed" && t.resolutionNote && (
        <div className="callout info">
          <strong>{preventive ? "Done" : "Fixed"}:</strong> {t.resolutionNote}
        </div>
      )}

      <div className="detail">
        <section>
          <dl className="facts">
            <div>
              <dt>Reported by</dt>
              <dd>
                {t.reporterName} {!preventive && <span className="sub">{card.ownerEmail}</span>}
              </dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>{t.room}</dd>
            </div>
            {t.equipment && (
              <div>
                <dt>Equipment</dt>
                <dd>{t.equipment}</dd>
              </div>
            )}
            <div>
              <dt>Urgency</dt>
              <dd>
                {URGENCY[t.urgency].label} <span className="sub">· the aim is to pick it up {URGENCY[t.urgency].target}</span>
              </dd>
            </div>
            <div>
              <dt>Who has it</dt>
              <dd>{t.assigneeEmail ?? "Nobody yet"}</dd>
            </div>
            {t.dueDate && (
              <div>
                <dt>{preventive ? "Due" : "Target date"}</dt>
                <dd>{fmtDay(t.dueDate)}</dd>
              </div>
            )}
            <div>
              <dt>Reported</dt>
              <dd>{fmtDateTime(card.createdAt ?? t.history[0].at)}</dd>
            </div>
            {card.waitingOn && (
              <div>
                <dt>Now</dt>
                <dd>{card.waitingOn}</dd>
              </div>
            )}
            {t.jiraKey && (
              <div>
                <dt>From Jira</dt>
                <dd>{t.jiraKey}</dd>
              </div>
            )}
            {t.resolvedAt && (
              <div>
                <dt>{preventive ? "Done" : "Fixed"}</dt>
                <dd>{fmtDate(t.resolvedAt)}</dd>
              </div>
            )}
          </dl>

          <h2>Details</h2>
          <div className="panel pre">{t.description}</div>
          {t.labels && t.labels.length > 0 && (
            <div className="tags">
              {t.labels.map((l) => (
                <span key={l} className="tag info">
                  {l}
                </span>
              ))}
            </div>
          )}

          <h2>Photos</h2>
          {t.photos.length === 0 ? (
            <p className="sub">No photos yet.</p>
          ) : (
            <ul className="files">
              {t.photos.map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {p.name}
                    </a>
                  ) : (
                    p.name
                  )}{" "}
                  <span className="sub">
                    {Math.ceil(p.size / 1024)} KB · {p.by} · {fmtDate(p.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {can("photos") && (
            <form action={addTicketPhotos} className="row photoform">
              {hidden("id", card.id)}
              <input type="file" name="photos" multiple required accept="image/jpeg,image/png,image/heic,image/heif,image/webp,.heic,.heif" aria-label="Photos to add" />
              <button className="button secondary" type="submit">
                Add photos
              </button>
            </form>
          )}
        </section>

        <aside>
          <Actions />
          {!own && isOpen(t) && (
            <form action={watchTicket} className="watchform">
              {hidden("id", card.id)}
              {hidden("on", isWatching(card, actor.email) ? "0" : "1")}
              <button className="linkbtn" type="submit">
                {isWatching(card, actor.email) ? "Stop following this ticket" : "Follow this ticket (hear when it moves)"}
              </button>
            </form>
          )}
          <CommentsSection id={card.id} comments={card.comments} action={commentOnTicket} />
          <h2>History</h2>
          <HistoryList entries={t.history} />
        </aside>
      </div>
    </>
  );

  function Actions() {
    const acts = (["assign", "start", "wait", "resolve", "due", "confirm", "reopen", "cancel"] as Action[]).filter(can);
    if (acts.length === 0) {
      if (!isOpen(t)) return null;
      if (own && t.status === "new") return <div className="panel sub">The {TEAM_NAME[t.team]} team has been told. They aim to pick it up {URGENCY[t.urgency].target}.</div>;
      if (own) return <div className="panel sub">The team is on it. You&apos;ll hear when it&apos;s fixed. Add a comment if anything changes.</div>;
      return null;
    }
    const others = members.filter((m) => m !== actor.email);
    return (
      <div className="panel actions">
        {can("confirm") && (
          <>
            <h3>Is it fixed?</h3>
            <form action={actOnTicket} className="stack">
              {base}
              <label className="field">
                <span>If it&apos;s not fixed, say what&apos;s still wrong</span>
                <textarea name="note" rows={2} maxLength={2000} />
              </label>
              <div className="row">
                <button className="button" formAction={actOnTicketWith.bind(null, "confirm")} type="submit">
                  Yes, it&apos;s fixed
                </button>
                <button className="button secondary" formAction={actOnTicketWith.bind(null, "reopen")} type="submit">
                  It&apos;s not fixed
                </button>
              </div>
            </form>
          </>
        )}
        {can("assign") && (
          <>
            <h3>{t.assigneeEmail ? "Hand it to someone else" : "Who will take it?"}</h3>
            {onTeam(actor, t.team) && !t.assigneeEmail && (
              <form action={actOnTicket}>
                {base}
                {hidden("action", "assign")}
                {hidden("assignee", actor.email)}
                <button className="button" type="submit">
                  I&apos;ll take it
                </button>
              </form>
            )}
            {others.length > 0 && (
              <form action={actOnTicket} className="row assignform">
                {base}
                {hidden("action", "assign")}
                <select name="assignee" defaultValue="" required aria-label="Team member">
                  <option value="" disabled>
                    Choose a team member
                  </option>
                  {(onTeam(actor, t.team) && t.assigneeEmail && t.assigneeEmail !== actor.email ? [actor.email, ...others] : others)
                    .filter((m) => m !== t.assigneeEmail)
                    .map((m) => (
                      <option key={m} value={m}>
                        {m === actor.email ? `Me (${m})` : m}
                      </option>
                    ))}
                </select>
                <button className="button secondary" type="submit">
                  Assign
                </button>
              </form>
            )}
            {members.length === 0 && <p className="note">Nobody is in the {TEAM_NAME[t.team]} Google Group yet. Ask a portal admin to add the team.</p>}
          </>
        )}
        {can("start") && (
          <>
            <h3>Work</h3>
            <form action={actOnTicket}>
              {base}
              {hidden("action", "start")}
              <button className="button" type="submit">
                {t.status === "waiting_parts" ? "Parts are in: back to work" : "Start work"}
              </button>
            </form>
          </>
        )}
        {can("wait") && (
          <form action={actOnTicket} className="stack spaced">
            {base}
            {hidden("action", "wait")}
            <label className="field">
              <span>Waiting on parts? Say what&apos;s on order and when it&apos;s due</span>
              <input name="note" maxLength={300} placeholder="Strike plate from the locksmith, due Thursday" />
            </label>
            <div>
              <button className="button secondary" type="submit">
                Waiting on parts
              </button>
            </div>
          </form>
        )}
        {can("resolve") && (
          <>
            <h3>{preventive ? "Done?" : "Fixed?"}</h3>
            <form action={actOnTicket} className="stack">
              {base}
              {hidden("action", "resolve")}
              <label className="field">
                <span>What did you do?</span>
                <textarea name="note" rows={2} maxLength={2000} required />
              </label>
              <div>
                <button className="button" type="submit">
                  {preventive ? "Mark done" : "Mark fixed"}
                </button>
              </div>
              {!preventive && <p className="note">The reporter is asked to check and confirm. It closes by itself after 7 days.</p>}
            </form>
          </>
        )}
        {can("due") && (
          <form action={actOnTicket} className="row assignform spaced">
            {base}
            {hidden("action", "due")}
            <label className="field">
              <span>Target date</span>
              <input type="date" name="due" defaultValue={t.dueDate ?? ""} />
            </label>
            <button className="button secondary" type="submit">
              {t.dueDate ? "Change" : "Set"}
            </button>
          </form>
        )}
        {can("cancel") && (
          <form action={actOnTicket} className="cancelform">
            {base}
            {hidden("action", "cancel")}
            <button className="linkbtn danger" type="submit">
              Cancel this request
            </button>
          </form>
        )}
      </div>
    );
  }
}
