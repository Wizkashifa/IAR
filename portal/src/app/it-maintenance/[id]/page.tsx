import Link from "next/link";
import { mayDeleteRequests } from "@/lib/card-delete";
import { DeleteRequest } from "@/app/requests/DeleteRequest";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { ConfirmButton } from "@/components/Confirm";
import { DateField } from "@/components/DateField";
import { Field } from "@/components/Field";
import { FileDrop } from "@/components/FileDrop";
import { KeyValue } from "@/components/KeyValue";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { PeoplePicker } from "@/components/PeoplePicker";
import { Pill } from "@/components/Pill";
import { CommentsPanel, HistoryPanel } from "@/components/Activity";
import { FlashNote } from "@/components/FlashNote";
import { RequestPage } from "@/components/RequestPage";
import { ROW_TONE, rowState } from "@/lib/card-row";
import { cardStore } from "@/lib/cards";
import { mentionablePeople } from "@/lib/mentions";
import { nameResolver } from "@/lib/names";
import { nextStepText, stepsFor } from "@/lib/next-step";
import { actorFor } from "@/lib/people";
import { requireViewer } from "@/lib/viewer";
import { canViewTicket } from "@/lib/tickets/access";
import { teamMembers, ticketActor } from "@/lib/tickets/context";
import { rowStatusText, statusText } from "@/lib/status-text";
import { KIND_LABEL, LINK_LABEL, TEAM_NAME, URGENCY, type TicketTeam } from "@/lib/tickets/types";
import { type Action, type TicketCard, isOpen, isTicketCard, isWatching, onTeam, permission, TICKET_TEAMS } from "@/lib/tickets/workflow";
import { actOnTicket, actOnTicketWith, addTicketPhotos, commentOnTicket, linkTicket, watchTicket } from "../actions";
import { FLASH, REPLIES, TicketTags, fmtDate, fmtDateTime, fmtDay } from "../ui";
import styles from "../tickets.module.css";
import { Disclosure } from "@/components/Disclosure";
import { FileList } from "@/components/FileList";

export const dynamic = "force-dynamic";

/** "Reported to the team" reads on after a name; "IT Services…" keeps its capitals. */

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
  // Who it can be handed to: its own team first, then the other team (IT Services and Facility Maintenance hand tickets to each other).
  const [byTeam, needsActor] = await Promise.all([can("assign") ? teamMembers() : Promise.resolve({ it: [], facilities: [] } as Record<TicketTeam, string[]>), actorFor(viewer)]);
  const members = [...new Set([...byTeam[t.team], ...TICKET_TEAMS.filter((x) => x !== t.team).flatMap((x) => byTeam[x])])];
  const otherTeam = (m: string) => (byTeam[t.team].includes(m) ? undefined : TEAM_NAME[TICKET_TEAMS.find((x) => byTeam[x].includes(m)) ?? t.team]);
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
  // The first main action goes in the bottom bar, sending its form here by id; the rest stay below as plain buttons.
  const BAR_ACTIONS = ["confirm", "assign", "start", "resolve"];
  const barAction = primary.find((a) => BAR_ACTIONS.includes(a) && (a !== "assign" || (team && t.assigneeEmail !== actor.email)));
  // Marking it fixed needs "What did you do?" first: the bar jumps to its own panel (decide) instead of sending it.
  const resolveOwn = barAction === "resolve";
  const inBar = (a: string) => a === barAction && !resolveOwn;
  const variantFor = (a: Action): "primary" | "default" => (primary.includes(a) && !barAction ? "primary" : "default");
  const startLabel = t.status === "waiting_parts" ? "Parts are in: back to work" : "Start work";
  const resolveLabel = preventive ? "Mark done" : "Mark fixed";
  const barMain =
    barAction === "confirm" ? (
      <Button variant="primary" type="submit" form="ticket-confirm" formAction={actOnTicketWith.bind(null, "confirm")}>
        Yes, it&apos;s fixed
      </Button>
    ) : resolveOwn ? (
      <Button href="#request-decide" variant="primary" icon="chevD">
        {resolveLabel}
      </Button>
    ) : barAction ? (
      <Button variant="primary" type="submit" form={`ticket-${barAction}`}>
        {barAction === "assign" ? "I'll take it" : barAction === "start" ? startLabel : resolveLabel}
      </Button>
    ) : undefined;

  // ---- The action forms, each usable in the row or under "More" ----------------
  const forms: Record<string, ReactNode> = {
    link: (
      <form key="link" action={linkTicket} className={`stack grow`}>
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
      <form key="confirm" id="ticket-confirm" action={actOnTicket} className={`stack grow`}>
        {base}
        <Field label="If it's not fixed, say what's still wrong" hint={`It closes by itself after 7 days if nobody says otherwise.`}>
          <textarea name="note" rows={2} maxLength={2000} />
        </Field>
        <div className="row">
          {!inBar("confirm") && (
            <Button variant="primary" type="submit" formAction={actOnTicketWith.bind(null, "confirm")}>
              Yes, it&apos;s fixed
            </Button>
          )}
          <Button type="submit" formAction={actOnTicketWith.bind(null, "reopen")}>
            It&apos;s not fixed
          </Button>
        </div>
      </form>
    ),
    assign: (
      <div key="assign" className="row bottom">
        {team && t.assigneeEmail !== actor.email && (
          <form id="ticket-assign" action={actOnTicket}>
            {base}
            <input type="hidden" name="action" value="assign" />
            <input type="hidden" name="assignee" value={actor.email} />
            {!inBar("assign") && (
              <Button variant={variantFor("assign")} type="submit">
                I&apos;ll take it
              </Button>
            )}
          </form>
        )}
        {members.filter((m) => m !== t.assigneeEmail).length > 0 ? (
          <form action={actOnTicket} className="row bottom">
            {base}
            <input type="hidden" name="action" value="assign" />
            <div className={styles.picker}>
              <PeoplePicker
                name="assignee"
                label={t.assigneeEmail ? "Hand it to someone else" : "Or give it to"}
                people={members.filter((m) => m !== t.assigneeEmail).map((m) => ({ email: m, name: m === actor.email ? `Me (${names(m)})` : names(m), note: otherTeam(m) }))}
              />
            </div>
            <Button type="submit">Assign</Button>
          </form>
        ) : (
          members.length === 0 && <p className="hint">Nobody is in the IT Services or Facility Maintenance Google Group yet. Ask a portal admin to add the teams.</p>
        )}
      </div>
    ),
    start: (
      <form key="start" id="ticket-start" action={actOnTicket}>
        {base}
        <input type="hidden" name="action" value="start" />
        {!inBar("start") && (
          <Button variant={variantFor("start")} type="submit">
            {startLabel}
          </Button>
        )}
      </form>
    ),
    resolve: (
      <form key="resolve" id="ticket-resolve" action={actOnTicket} className={`stack grow`}>
        {base}
        <input type="hidden" name="action" value="resolve" />
        <Field label={preventive ? "Done? What did you do?" : "Fixed? What did you do?"} required hint={preventive ? undefined : "The reporter is asked to check and confirm."}>
          <textarea name="note" rows={2} maxLength={2000} required />
        </Field>
        {!inBar("resolve") && (
          <div>
            <Button variant={resolveOwn ? "primary" : variantFor("resolve")} type="submit">
              {resolveLabel}
            </Button>
          </div>
        )}
      </form>
    ),
    wait: (
      <form key="wait" action={actOnTicket} className={`stack grow`}>
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
      <form key="due" action={actOnTicket} className={`stack grow`}>
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

  const rowActions = primary.filter((a) => !(resolveOwn && a === "resolve"));
  const actions =
    rowActions.length || more.length || cancel ? (
      <div className="stack">
        {rowActions.length > 0 && <div className="row bottom">{rowActions.map((a) => forms[a])}</div>}
        {(more.length > 0 || cancel) && (
          <Disclosure summary="More" divided={rowActions.length > 0}>
            <div className="grid">
              {more.map((a) => forms[a])}
              {cancel}
            </div>
          </Disclosure>
        )}
      </div>
    ) : undefined;

  const state = rowState(card, needsActor);
  const statusTone = ROW_TONE[state];
  const notes = (
    <>
      <FlashNote ok={sp.ok} error={sp.error} messages={FLASH} />
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
          <FileList files={t.photos.map((p) => ({ ...p, by: nameOf(p.by) }))} empty="No photos yet." />
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

      <CommentsPanel id={card.id} comments={card.comments} names={nameOf} action={commentOnTicket} noun="ticket" replies={team ? REPLIES : undefined} people={await mentionablePeople(card)} me={viewer.email} />
      <HistoryPanel entries={t.history} names={nameOf} />
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
            <p className="hint">{isWatching(card, actor.email) ? "You'll hear when this ticket moves." : "Hear when this ticket moves, without being on the team."}</p>
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
      admin={mayDeleteRequests(viewer) ? <DeleteRequest id={card.id} /> : undefined}
      id={card.id}
      title={card.title}
      pills={
        <>
          <Pill tone={statusTone} status>
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
      bar={barMain ? { label: rowStatusText(card, state), main: barMain } : undefined}
      decide={resolveOwn ? { title: preventive ? "Mark it done" : "Mark it fixed", body: forms.resolve } : undefined}
      main={main}
      side={side}
    />
  );
}
