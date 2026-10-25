import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { ConfirmButton } from "@/components/Confirm";
import { DateField } from "@/components/DateField";
import { Field } from "@/components/Field";
import { FileDrop } from "@/components/FileDrop";
import { Icon } from "@/components/Icon";
import { KeyValue } from "@/components/KeyValue";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { PeoplePicker } from "@/components/PeoplePicker";
import { Pill } from "@/components/Pill";
import { RequestPage } from "@/components/RequestPage";
import { ROW_TONE, rowState } from "@/lib/card-row";
import { cardStore } from "@/lib/cards";
import { COMMENT_MAX } from "@/lib/comments";
import { nameResolver } from "@/lib/names";
import { nextStepText, stepsFor } from "@/lib/next-step";
import { actorFor } from "@/lib/people";
import { requireViewer } from "@/lib/viewer";
import { canViewTicket } from "@/lib/tickets/access";
import { teamMembers, ticketActor } from "@/lib/tickets/context";
import { statusText } from "@/lib/status-text";
import { KIND_LABEL, LINK_LABEL, TEAM_NAME, URGENCY } from "@/lib/tickets/types";
import { type Action, type TicketCard, isOpen, isTicketCard, isWatching, onTeam, permission } from "@/lib/tickets/workflow";
import { actOnTicket, actOnTicketWith, addTicketPhotos, commentOnTicket, linkTicket, watchTicket } from "../actions";
import { CommentBox } from "../CommentBox";
import { TicketFlash, TicketTags, fmtDate, fmtDateTime, fmtDay } from "../ui";
import styles from "../tickets.module.css";

export const dynamic = "force-dynamic";

/** "Reported to the team" reads on after a name; "IT Services…" keeps its capitals. */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];

async function viewable(id: string) {
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const card = await (await cardStore()).get(id);
  // A ticket someone can't open looks the same as one that doesn't exist.
  if (!isTicketCard(card) || !canViewTicket(card, { ...actor, seeAll: viewer.roles.includes("admins") })) return null;
  return { viewer, actor, card };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const found = await viewable((await params).id);
  return { title: found ? `${found.card.title} · ${found.card.id}` : "Not available" };
}

/**
 * The next sensible step for the ticket's state, shown in the action row.
 * Everything else the person may do sits under "More".
 */
function primaryFor(card: TicketCard): Action[] {
  const t = card.ticket;
  switch (t.status) {
    case "resolved":
      return ["confirm"];
    case "new":
      return ["assign"];
    case "reopened":
      return t.assigneeEmail ? ["start"] : ["assign"];
    case "assigned":
    case "waiting_parts":
      return ["start"];
    case "in_progress":
      return ["resolve", "wait"];
    default:
      return [];
  }
}

export default async function TicketDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; sent?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const found = await viewable(id);
  if (!found) notFound();
  const { viewer, actor, card } = found;

  const t = card.ticket;
  const can = (a: Action) => permission(card, actor, a).ok;
  const own = card.ownerEmail.toLowerCase() === actor.email;
  const preventive = t.kind === "preventive";
  const team = onTeam(actor, t.team);
  const [members, needsActor] = await Promise.all([can("assign") ? teamMembers().then((m) => m[t.team]) : Promise.resolve([] as string[]), actorFor(viewer)]);
  const names = await nameResolver([card.ownerEmail, ...(t.assigneeEmail ? [t.assigneeEmail] : []), ...members, ...t.history.map((h) => h.by).filter((b) => b.includes("@"))]);
  const nameOf = (who: string) => (who.includes("@") ? names(who) : who);

  const base = (
    <>
      <input type="hidden" name="id" value={card.id} />
      <input type="hidden" name="expected" value={card.updatedAt} />
    </>
  );
  const permitted = (["assign", "start", "wait", "resolve", "due", "link", "cancel"] as Action[]).filter(can);
  const primary = primaryFor(card).filter(can);
  const more = permitted.filter((a) => !primary.includes(a) && a !== "cancel");

  // ---- The action forms, each usable in the row or under "More" ----------------
  const forms: Record<string, ReactNode> = {
    link: (
      <form key="link" action={linkTicket} className={`stack ${styles.grow}`}>
        <input type="hidden" name="id" value={card.id} />
        <Field label="Link another ticket" hint="Its number, like TK-1003.">
          <input name="other" maxLength={20} required placeholder="TK-1003" />
        </Field>
        <Field label="How are they linked?">
          <select name="kind" defaultValue="relates">
            <option value="relates">Related</option>
            <option value="duplicates">This is the same problem as that one</option>
            <option value="duplicated_by">That one is the same problem as this</option>
          </select>
        </Field>
        <div>
          <Button type="submit">Link</Button>
        </div>
      </form>
    ),
    confirm: (
      <form key="confirm" action={actOnTicket} className={`stack ${styles.grow}`}>
        {base}
        <Field label="If it's not fixed, say what's still wrong" hint={`It closes by itself after 7 days if nobody says otherwise.`}>
          <textarea name="note" rows={2} maxLength={2000} />
        </Field>
        <div className="row">
          <Button variant="primary" type="submit" formAction={actOnTicketWith.bind(null, "confirm")}>
            Yes, it&apos;s fixed
          </Button>
          <Button type="submit" formAction={actOnTicketWith.bind(null, "reopen")}>
            It&apos;s not fixed
          </Button>
        </div>
      </form>
    ),
    assign: (
      <div key="assign" className={styles.actionRow}>
        {team && t.assigneeEmail !== actor.email && (
          <form action={actOnTicket}>
            {base}
            <input type="hidden" name="action" value="assign" />
            <input type="hidden" name="assignee" value={actor.email} />
            <Button variant={primary.includes("assign") ? "primary" : "default"} type="submit">
              I&apos;ll take it
            </Button>
          </form>
        )}
        {members.filter((m) => m !== t.assigneeEmail).length > 0 ? (
          <form action={actOnTicket} className={styles.actionRow}>
            {base}
            <input type="hidden" name="action" value="assign" />
            <div className={styles.picker}>
              <PeoplePicker
                name="assignee"
                label={t.assigneeEmail ? "Hand it to someone else" : "Or give it to"}
                people={members.filter((m) => m !== t.assigneeEmail).map((m) => ({ email: m, name: m === actor.email ? `Me (${names(m)})` : names(m) }))}
              />
            </div>
            <Button type="submit">Assign</Button>
          </form>
        ) : (
          members.length === 0 && <p className="note">Nobody is in the {TEAM_NAME[t.team]} Google Group yet. Ask a portal admin to add the team.</p>
        )}
      </div>
    ),
    start: (
      <form key="start" action={actOnTicket}>
        {base}
        <input type="hidden" name="action" value="start" />
        <Button variant={primary.includes("start") ? "primary" : "default"} type="submit">
          {t.status === "waiting_parts" ? "Parts are in: back to work" : "Start work"}
        </Button>
      </form>
    ),
    resolve: (
      <form key="resolve" action={actOnTicket} className={`stack ${styles.grow}`}>
        {base}
        <input type="hidden" name="action" value="resolve" />
        <Field label={preventive ? "Done? What did you do?" : "Fixed? What did you do?"} required hint={preventive ? undefined : "The reporter is asked to check and confirm."}>
          <textarea name="note" rows={2} maxLength={2000} required />
        </Field>
        <div>
          <Button variant={primary.includes("resolve") ? "primary" : "default"} type="submit">
            {preventive ? "Mark done" : "Mark fixed"}
          </Button>
        </div>
      </form>
    ),
    wait: (
      <form key="wait" action={actOnTicket} className={`stack ${styles.grow}`}>
        {base}
        <input type="hidden" name="action" value="wait" />
        <Field label="Waiting on parts? Say what's on order and when it's due">
          <input name="note" maxLength={300} placeholder="Strike plate from the locksmith, due Thursday" />
        </Field>
        <div>
          <Button type="submit">Waiting on parts</Button>
        </div>
      </form>
    ),
    due: (
      <form key="due" action={actOnTicket} className={`stack ${styles.grow}`}>
        {base}
        <input type="hidden" name="action" value="due" />
        <DateField name="due" label={preventive ? "Due date" : "Target date"} defaultValue={t.dueDate ?? null} clearable />
        <div>
          <Button type="submit">{t.dueDate ? "Change date" : "Set date"}</Button>
        </div>
      </form>
    ),
  };

  const cancel = can("cancel") && (
    <form action={actOnTicket}>
      {base}
      <input type="hidden" name="action" value="cancel" />
      <ConfirmButton variant="quiet" danger title="Cancel this request?" message="The team stops working on it. You can send a new request any time." confirmLabel="Yes, cancel it">
        {own ? "Withdraw this request" : "Cancel this ticket"}
      </ConfirmButton>
    </form>
  );

  const actions =
    primary.length || more.length || cancel ? (
      <div className={styles.actionsWrap}>
        {primary.length > 0 && <div className={styles.actionRow}>{primary.map((a) => forms[a])}</div>}
        {(more.length > 0 || cancel) && (
          <details className={primary.length ? styles.more : styles.moreAlone}>
            <summary>
              <Icon name="chevD" size="sm" />
              More
            </summary>
            <div className={styles.moreGrid}>
              {more.map((a) => forms[a])}
              {cancel}
            </div>
          </details>
        )}
      </div>
    ) : undefined;

  const statusTone = ROW_TONE[rowState(card, needsActor)];
  const notes = (
    <>
      <TicketFlash ok={sp.ok} error={sp.error} />
      {t.status === "resolved" && t.resolutionNote && (
        <Note tone="ok">
          <strong>Marked fixed:</strong> {t.resolutionNote}
        </Note>
      )}
      {t.status === "reopened" && t.reopenNote && (
        <Note tone="warn">
          <strong>Reopened:</strong> {t.reopenNote}
        </Note>
      )}
      {t.status === "closed" && t.resolutionNote && (
        <Note tone="ok">
          <strong>{preventive ? "Done" : "Fixed"}:</strong> {t.resolutionNote}
        </Note>
      )}
    </>
  );

  const main = (
    <>
      <Panel title="Details">
        <p className={styles.description}>{t.description}</p>
        {t.labels && t.labels.length > 0 && (
          <div className={styles.tags}>
            {t.labels.map((l) => (
              <Pill key={l} tone="info">
                {l}
              </Pill>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Photos" right={<span>{t.photos.length}</span>}>
        <div className="stack">
          {t.photos.length === 0 ? (
            <p className="note">No photos yet.</p>
          ) : (
            <ul className={styles.photos}>
              {t.photos.map((p, i) => (
                <li key={`${p.name}-${i}`} className={styles.photo}>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {p.name}
                    </a>
                  ) : (
                    <span>{p.name}</span>
                  )}
                  <span className={styles.sub}>
                    {Math.ceil(p.size / 1024)} KB · {nameOf(p.by)} · {fmtDate(p.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {can("photos") && (
            <form action={addTicketPhotos} className="stack">
              <input type="hidden" name="id" value={card.id} />
              <FileDrop name="photos" label="Add photos" accept={PHOTO_TYPES} camera />
              <div>
                <Button type="submit">Add photos</Button>
              </div>
            </form>
          )}
        </div>
      </Panel>

      <Panel title="Comments" right={<span>{(card.comments ?? []).length}</span>} id="comments">
        <div className="stack">
          {(card.comments ?? []).length === 0 ? (
            <p className="note">No comments yet. Ask a question or add context; everyone who can open this ticket sees it.</p>
          ) : (
            <ol className={styles.comments}>
              {(card.comments ?? []).map((c) => (
                <li key={c.id} className={styles.comment}>
                  <span>
                    <strong>{c.name}</strong> <span className={styles.sub}>{fmtDateTime(c.at)}</span>
                  </span>
                  <p className={styles.commentText}>{c.text}</p>
                </li>
              ))}
            </ol>
          )}
          <CommentBox id={card.id} max={COMMENT_MAX} action={commentOnTicket} replies={team} />
        </div>
      </Panel>

      <Panel title="History">
        <ol className={styles.history}>
          {[...t.history].reverse().map((h, i) => (
            <li key={i}>
              <strong>{nameOf(h.by)}</strong> {lowerFirst(h.action)}
              <span className={styles.sub}>{fmtDateTime(h.at)}</span>
              {h.note && <span className={styles.commentText}>{h.note}</span>}
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );

  const side = (
    <>
      <Panel title="About this ticket">
        <KeyValue
          items={[
            { label: "Reported by", value: preventive ? "Preventive schedule" : t.reporterName },
            { label: "Where", value: t.room },
            { label: "Equipment", value: t.equipment },
            { label: "Urgency", value: `${URGENCY[t.urgency].label}: picked up ${URGENCY[t.urgency].target}` },
            { label: "Who has it", value: t.assigneeEmail ? names(t.assigneeEmail) : isOpen(t) ? `The ${TEAM_NAME[t.team]} team` : undefined },
            { label: preventive ? "Due" : "Target date", value: t.dueDate ? fmtDay(t.dueDate) : undefined },
            { label: "Reported", value: fmtDateTime(card.createdAt ?? t.history[0].at) },
            { label: preventive ? "Done" : "Fixed", value: t.resolvedAt ? fmtDate(t.resolvedAt) : undefined },
            { label: "From Jira", value: t.jiraKey },
          ]}
        />
      </Panel>
      {(t.links ?? []).length > 0 && (
        <Panel title="Linked tickets">
          <ul className={styles.links}>
            {(t.links ?? []).map((l) => (
              <li key={l.id}>
                <span className={styles.sub}>{LINK_LABEL[l.kind]}</span>
                <Link href={`/it-maintenance/${l.id}`}>{l.id}</Link>
                {can("link") && (
                  <form action={linkTicket}>
                    <input type="hidden" name="id" value={card.id} />
                    <input type="hidden" name="unlink" value={l.id} />
                    <button type="submit" className={styles.linkBtn} aria-label={`Remove the link to ${l.id}`}>
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {!own && isOpen(t) && (
        <Panel title="Follow">
          <form action={watchTicket} className="stack">
            <input type="hidden" name="id" value={card.id} />
            <input type="hidden" name="on" value={isWatching(card, actor.email) ? "0" : "1"} />
            <p className="note">{isWatching(card, actor.email) ? "You'll hear when this ticket moves." : "Hear when this ticket moves, without being on the team."}</p>
            <div>
              <Button type="submit" icon={isWatching(card, actor.email) ? "x" : "bell"}>
                {isWatching(card, actor.email) ? "Stop following" : "Follow this ticket"}
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </>
  );

  return (
    <RequestPage
      crumb={{ href: "/it-maintenance", label: "IT & Maintenance" }}
      id={card.id}
      title={card.title}
      pills={
        <>
          <Pill tone={statusTone} dot>
            {statusText(card)}
          </Pill>
          <TicketTags card={card} />
        </>
      }
      lead={[KIND_LABEL[t.kind], TEAM_NAME[t.team], !preventive && `from ${t.reporterName}`, t.room]}
      steps={stepsFor(card)}
      next={nextStepText(card, viewer, names)}
      sent={sp.sent === "1"}
      notes={notes}
      actions={actions}
      main={main}
      side={side}
    />
  );
}
