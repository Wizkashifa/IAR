import type { Metadata } from "next";
import { mayDeleteRequests } from "@/lib/card-delete";
import { DeleteRequest } from "@/app/requests/DeleteRequest";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/Button";
import { ConfirmButton } from "@/components/Confirm";
import { EmptyState } from "@/components/EmptyState";
import { Field, FormActions } from "@/components/Field";
import { KeyValue } from "@/components/KeyValue";
import { Note } from "@/components/Note";
import { Panel, PanelFoot } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { CommentsPanel, HistoryPanel } from "@/components/Activity";
import { FlashNote } from "@/components/FlashNote";
import { CardRow, ItemRow, Rows } from "@/components/ItemRow";
import { rowsFor } from "@/components/ItemList";
import { canViewMarketing } from "@/lib/marketing/access";
import { mayAddPiece } from "@/lib/marketing/linked";
import { OPEN_STAGES } from "@/lib/marketing/workflow";
import { RequestPage } from "@/components/RequestPage";
import { agendaBetween } from "@/lib/agenda";
import { ROW_TONE, emailsIn, rowState, whoText } from "@/lib/card-row";
import { cardStore } from "@/lib/cards";
import { HINT, NOTIFIED, VERB, STATUS_LABEL } from "@/lib/glossary";
import { canOpenCard } from "@/lib/access";
import { canRequestAgain } from "@/lib/again";
import { mentionablePeople } from "@/lib/mentions";
import { nameResolver, peopleOptions } from "@/lib/names";
import { piecesFor } from "@/lib/marketing/pieces";
import { ticketsFor } from "@/lib/events/linked-sync";
import { isOpen as isTicketOpen } from "@/lib/tickets/workflow";
import { nextStepText, stepsFor } from "@/lib/next-step";
import { rowStatusText, statusText } from "@/lib/status-text";
import { requireViewer } from "@/lib/viewer";
import { busyFor, eventAccess, eventContext, mayBookRestricted } from "@/lib/events/context";
import { AV_INCLUDES, AV_KINDS } from "@/lib/events/input";
import { roomById } from "@/lib/events/rooms";
import { eventChecks, eventFlags, findClashes, fixesText, missionReasons, quickFixes, ruleOn, windowText } from "@/lib/events/rules";
import { dayText, longDate, recurText, timeText } from "@/lib/events/series";
import { CHOICE_LABEL, SLOT_STATUS_LABEL, type SlotRequest, canDecide, closesOn, datesText, isOpenAsk, offPortal } from "@/lib/events/slot-requests";
import { STAGE_LABEL, firstStage, isEventCard, permission, reviewersFor, type EventAction } from "@/lib/events/workflow";
import { changeApprovers, changePermission, changeStep, changeWho, editPermission, timeChanges, timeOf } from "@/lib/events/reschedule";
import { RENEW_DAYS, renewalOpens, renewalState } from "@/lib/events/renewal";
import { closeOutPermission, linkedPurchases, spendOf, spendText } from "@/lib/events/closeout";
import { TASK_TEAMS, tasksFor, worksTeam } from "@/lib/events/tasks";
import { queueTeamMembers } from "@/lib/groups";
import { imagesOf, imagesPermission } from "@/lib/events/images";
import { IMAGE_ACCEPT, MAX_FILE_MB, MAX_PER_UPLOAD } from "@/lib/marketing/files";
import { marketingFolder } from "@/lib/marketing/drive";
import { FileDrop } from "@/components/FileDrop";
import { FileList } from "@/components/FileList";
import { purchaseTotal } from "@/lib/purchases/types";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { actOnEvent, actOnEventWith, addEventImages, commentOnEvent, decideAsk, decideAskWith, withdrawAsk } from "../actions";
import { closeOutEvent } from "../ops-actions";
import { TASK_FLASH, TaskLine } from "../ops-ui";
import { roomDay } from "../calendar";
import { BriefFields, ChecksList, QuickFixes, Timeline, checksSummary } from "../ui";
import styles from "../events.module.css";
import { daysBetween } from "@/lib/dates";
import { Checkbox } from "@/components/Choices";
import { Disclosure } from "@/components/Disclosure";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  approve: "Approved.",
  return: "Sent back with your note. The room hold comes off the calendar until it's resubmitted.",
  deny: "Declined.",
  cancel: "Request cancelled and taken off the calendar.",
  decided: "Your answer is saved and both requests are updated.",
  withdrawn: "Ask withdrawn. Pick another time or room.",
  "closed-out": "Closed out. Thank you! The event is now closed.",
  images: "Images added. Marketing can open them here and in the marketing Shared Drive.",
  rescheduled: "New time saved. The checks were run again, and anyone who already approved it has been told.",
  reschedule: "New time saved. The checks were run again, and anyone who already approved it has been told.",
  "change-asked": "New time sent for approval. The approved time stays booked until then.",
  approve_change: "New time approved. The room is moved on the calendar and the requester is told.",
  decline_change: "New time declined. The approved time stays, and the requester sees your note.",
  withdraw_change: "New time withdrawn. The approved time stays.",
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const card = await (await cardStore()).get(id);
  if (!isEventCard(card) || !(await eventAccess(card, await requireViewer())).open) return { title: "Event" };
  return { title: card.title };
}


export default async function EventDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; sent?: string }> }) {
  const [{ id }, { ok, error, sent }] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer();
  const store = await cardStore();
  const card = await store.get(id);
  if (!isEventCard(card)) notFound();
  const [{ actor, ev, asks, open }, ctx] = await Promise.all([eventAccess(card, viewer), eventContext()]);
  // A request someone can't open looks the same as one that doesn't exist.
  if (!open) notFound();

  const ec = card;
  const e = card.event;
  const directors = ctx.directorsOf(e.committeeGroup);
  const can = (a: EventAction) => permission(card, ev, a, directors).ok;
  const own = card.ownerEmail === viewer.email.toLowerCase();
  const reviewing = can("approve");
  const live = reviewing ? eventChecks(e, { rooms: ctx.rooms, busy: await busyFor(ctx, e), today: ctx.today, rules: ctx.rules, mayBookRestricted: mayBookRestricted(viewer), excludeCard: card.id }) : null;
  // Changing the date or time: who may, and for the requester, small fixes that clear an overlap with one click.
  const editing = editPermission(card, ev, ctx.today, ruleOn(ctx.rules, "lead"));
  const changeOk = changePermission(card, ev, directors).ok;
  const busyNow = editing.ok && e.rooms.length ? await busyFor(ctx, e) : [];
  const clashesNow = editing.ok ? findClashes(e, ctx.rooms, busyNow, { excludeCard: card.id }) : [];
  const fixes = (editing.ok ? quickFixes(e, clashesNow, { rooms: ctx.rooms, busy: busyNow, excludeCard: card.id }) : []).filter((f) => !(editing.ok && editing.dateLocked && f.edit.date !== e.date));

  const roomNames = e.rooms.map((r) => roomById(ctx.rooms, r)?.name ?? r);
  const formerNames = e.rooms.map((r) => roomById(ctx.rooms, r)?.formerly).filter((x): x is string => Boolean(x));
  const reasons = missionReasons(e);
  const renewal = e.renewedBy ? await store.get(e.renewedBy) : null;
  const renewing = e.recur ? renewalState(card, { email: viewer.email, office: viewer.actingRoles.includes("office") }, ctx.today, isEventCard(renewal) ? renewal : null) : null;
  const tasks = tasksFor(card);
  const isLive = card.status === "approved" || card.status === "close_out" || card.status === "closed";
  const [purchases, allPieces, allTickets] = await Promise.all([store.listPurchasesForEvent(card.id), piecesFor(card.id), ticketsFor(card.id)]);
  const linked = linkedPurchases(purchases, card.id);
  const linkedVisible = linked.filter((p) => canOpenCard(p, { ...actor, seeAll: viewer.roles.includes("admins") }));
  const spent = spendOf(linked);
  // Its marketing pieces: one marketing request each, linked to this event.
  const pieces = allPieces.sort((a, b) => (a.createdAt ?? a.updatedAt).localeCompare(b.createdAt ?? b.updatedAt));
  const viewing = { ...actor, seeAll: viewer.roles.includes("admins") };
  const piecesVisible = pieces.filter((p) => canViewMarketing(p, viewing));
  // Its A/V: one ticket per date for IT, once it's approved.
  const avTickets = allTickets.sort((a, b) => (a.ticket.eventDate ?? "").localeCompare(b.ticket.eventDate ?? "") || a.id.localeCompare(b.id));
  const avVisible = avTickets.filter((t) => canOpenCard(t, viewing));
  const addPiece = mayAddPiece(card, actor).ok;
  const office = ev.roles.includes("office");
  const images = imagesOf(card);
  const canAddImages = imagesPermission(card, ev).ok;
  const uploads = canAddImages && Boolean(await marketingFolder());

  // Who each team's tasks can be handed to, for the teams this person works on.
  const myTeams = isLive ? TASK_TEAMS.filter((t) => worksTeam(t, viewer.actingRoles) && tasks.some((x) => x.team === t)) : [];
  const teamMembers = new Map(await Promise.all(myTeams.map(async (t) => [t, await queueTeamMembers(t)] as const)));

  // Everyone this page shows, by name.
  const emails = [...[...teamMembers.values()].flat(), card.ownerEmail, ...directors, ...e.history.map((h) => h.by), ...tasks.map((t) => t.assignee ?? ""), ...images.map((f) => f.by), ...emailsIn(piecesVisible), ...piecesVisible.map((p) => p.marketing.assignee ?? ""), ...avVisible.map((t) => t.ticket.assigneeEmail ?? ""), ...(card.waitingOn?.match(/[^\s:,()]+@[^\s:,()]+/g) ?? [])].filter((x) => x.includes("@"));
  const names = await nameResolver(emails);
  const opts = { today: ctx.today, directors };
  const steps = stepsFor(card, opts);
  // Waiting on an ask about a booking made off the portal: the IAR office answers it, so say so.
  const waitingAsk = e.stage === "slot" && card.status === "submitted" ? asks.find((a) => a.id === e.waitingOnAsk && isOpenAsk(a)) : undefined;
  const officeAnswers = Boolean(waitingAsk && offPortal(waitingAsk.hold));
  const nextReview0 = STAGE_LABEL[firstStage(card.ownerEmail, directors)];
  const next = officeAnswers
    ? `The IAR office answers ${own ? "your" : "the"} ask for the booked time, since it was booked on the IAR calendar, not in the portal. If they give it up, the request goes on to ${nextReview0.toLowerCase()}.${own ? ` ${NOTIFIED}` : ""}`
    : nextStepText(card, viewer, names, opts);
  const state = rowState(card, actor, { today: ctx.today, ctx: { directorsOf: ctx.directorsOf } });
  const tone = ROW_TONE[state];

  // The calendar beside the request: its first room on its next date (or its first).
  const calDate = e.dates.find((d) => d >= ctx.today) ?? e.dates[0] ?? e.date;
  const calRoom = e.rooms.map((r) => roomById(ctx.rooms, r)).find(Boolean);
  const calItems = calRoom ? roomDay(await agendaBetween(calDate, calDate), ctx.rooms, calRoom, calDate, card.id) : [];
  const holdWindow = holdTimes(e.start, e.end, e.setup, e.teardown);

  const base = (
    <>
      <input type="hidden" name="id" value={card.id} />
      <input type="hidden" name="expected" value={card.updatedAt} />
    </>
  );

  const notes = (
    <>
      <FlashNote ok={ok} error={error} messages={{ ...MESSAGES, ...TASK_FLASH }} />
      {card.status === "changes_requested" && (
        <Note tone="warn">
          <strong>{e.releasedFor ? "You gave up this time:" : "Sent back for changes:"}</strong> {e.returnNote}
          {own && can("resubmit") && (
            <>
              {" "}
              <Link href={`/events/${card.id}/edit`}>{e.releasedFor ? "Pick a new time" : VERB.makeChanges}</Link>
            </>
          )}
        </Note>
      )}
      {card.status === "close_out" && own && (
        <Note tone="warn">
          <strong>Waiting on you:</strong> the event is over. <a href="#closeout">Close it out</a>: attendance, how it went, and the final costs.
        </Note>
      )}
      {card.status === "denied" && e.returnNote && (
        <Note tone="bad">
          <strong>Declined:</strong> {e.returnNote}
        </Note>
      )}
      {e.stage === "slot" && card.status === "submitted" && (
        <Note>
          This request is waiting for an answer to an ask for a booked time (below). {nextReview0} starts once it&apos;s given up{own && editing.ok ? ", or once you change to a time that's free" : ""}.
        </Note>
      )}
      {own && fixes.length > 0 && (
        <QuickFixes
          fixes={fixes}
          text={fixesText(fixes, clashesNow.length)}
          button={(f, label) => (
            <form action={actOnEventWith.bind(null, "reschedule")}>
              {base}
              {Object.entries(f.edit).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={String(v)} />
              ))}
              <Button size="small" type="submit">{label}</Button>
            </form>
          )}
        />
      )}
      {e.change && card.status === "approved" && (
        <Note tone="warn">
          <strong>New time asked for:</strong> {dayText(e.change.date)}, {timeText(e.change.start)}–{timeText(e.change.end)} (setup {e.change.setup} min, cleanup {e.change.teardown} min). The approved time stays booked until {changeWho(card, directors)} approves it. <a href="#change">See the change</a>
        </Note>
      )}
      {reviewing && reasons.length > 0 && <Note>Look closely at this one: {reasons.join(", ")}.</Note>}
    </>
  );

  const act = actionParts();
  return (
    <RequestPage
      crumb={{ href: "/events", label: "Events & Rooms" }}
      admin={mayDeleteRequests(viewer) ? <DeleteRequest id={card.id} what="Its room holds come off the calendar, and anyone who asked for its time gets it." /> : undefined}
      id={card.id}
      title={card.title}
      pills={
        <>
          <Pill tone={tone} status>{statusText(card)}</Pill>
          {eventFlags(e).map((f) => (
            <Pill key={f} tone="tag">{f}</Pill>
          ))}
        </>
      }
      lead={["Event", e.committeeName, `from ${own ? "you" : names(card.ownerEmail)}`, e.recur ? `${recurText(e.date, e.recur)}, ${e.dates.length} dates` : dayText(e.date), `${timeText(e.start)}–${timeText(e.end)}`, roomNames.join(", ") || "Off-site"]}
      steps={steps}
      next={next}
      sent={sent === "1"}
      notes={notes}
      actions={act.panel}
      bar={act.main ? { label: rowStatusText(card, state), main: act.main } : undefined}
      main={
        <>
          <Panel title="About the event">
            <p className={styles.about}>{e.description}</p>
            {e.setupNotes && <p className="hint">Setup plan: {e.setupNotes}</p>}
          </Panel>

          {e.isPublic && e.brief && (
            <Panel title="Marketing brief">
              <BriefFields brief={e.brief} />
            </Panel>
          )}

          {e.isPublic && (images.length > 0 || canAddImages) && (
            <Panel title="Images for marketing" right={images.length ? `${images.length}` : undefined} id="images">
              <div className="stack">
                <FileList files={images.map((f) => ({ ...f, by: f.by === viewer.email.toLowerCase() ? "you" : names(f.by) }))} empty="No images yet." />
                {canAddImages &&
                  (uploads ? (
                    <form action={addEventImages} className="stack">
                      <input type="hidden" name="id" value={card.id} />
                      <FileDrop name="images" label="Add images" hint="Images only (JPG, PNG, HEIC)." accept={IMAGE_ACCEPT} maxFiles={MAX_PER_UPLOAD} maxSizeMb={MAX_FILE_MB} camera />
                      <div>
                        <Button type="submit">Add images</Button>
                      </div>
                    </form>
                  ) : (
                    <p className="hint">Image uploads for marketing aren&apos;t set up yet. Share a Google Drive link in a comment.</p>
                  ))}
              </div>
            </Panel>
          )}

          {(pieces.length > 0 || addPiece) && <MarketingPanel />}

          {(e.av || avTickets.length > 0) && <AvPanel />}

          {e.av && e.avNeeds && (
            <Panel title="A/V needs">
              <KeyValue
                items={[
                  { label: "Support", value: e.avNeeds.kinds.map((k) => AV_KINDS[k]).join(", ") || "Support requested" },
                  { label: "Includes", value: e.avNeeds.includes.map((k) => AV_INCLUDES[k]).join(", ") },
                ]}
              />
            </Panel>
          )}

          {e.teamNotes && (
            <Panel title="Notes for the teams">
              <p className={styles.about}>{e.teamNotes}</p>
            </Panel>
          )}

          {e.recur && <SeriesPanel />}

          {(card.status === "close_out" || card.status === "closed") && <CloseOutPanel />}


          {tasks.length > 0 && (
            <Panel title="Team tasks" right={`${tasks.filter((t) => t.status === "done").length} of ${tasks.length} done`} flush id="tasks">
              <Rows>
                {tasks.map((t) => (
                  <TaskLine key={t.id} card={ec} task={t} roles={viewer.actingRoles} email={viewer.email} back={`/events/${card.id}#tasks`} today={ctx.today} names={names} people={peopleOptions(teamMembers.get(t.team) ?? [], viewer.email, names)} />
                ))}
              </Rows>
            </Panel>
          )}

          {(linked.length > 0 || card.status === "approved" || card.status === "close_out") && (
            <Panel title="Payments for this event" right={e.budget ? `Budget ${fmtMoney(e.budget)}` : undefined} flush id="purchases">
              {linked.length === 0 ? (
                <EmptyState>None linked yet. When you send a payment request for this event, pick it under “Which event is it for?”.</EmptyState>
              ) : (
                <Rows>
                  {linkedVisible.map((p) => (
                    <ItemRow key={p.id} state="plain" href={`/purchases/${p.id}`} title={p.title} id={p.id} sub={statusText(p)} right={fmtMoney(p.purchase ? purchaseTotal(p.purchase) : 0)} />
                  ))}
                  {linked.length > linkedVisible.length && <ItemRow state="plain" title={`${linked.length - linkedVisible.length} more you can't open`} sub="Restricted" />}
                </Rows>
              )}
              <PanelFoot>
                Spent so far: <strong>{spendText(spent, e.budget)}</strong>
                {own && (card.status === "approved" || card.status === "close_out") ? <> · <Link href="/purchases/new">New payment request</Link></> : null}
              </PanelFoot>
            </Panel>
          )}

          {e.change && ec.status === "approved" && <ChangePanel />}

          {asks.length > 0 && (
            <section className="stack" id="asks" aria-label="Asks for a booked time">
              {asks.map((a) => (
                <AskPanel key={a.id} ask={a} cardId={card.id} />
              ))}
            </section>
          )}

          <CommentsPanel id={card.id} comments={card.comments} names={names} action={commentOnEvent} people={await mentionablePeople(card)} me={viewer.email} />
          <HistoryPanel entries={e.history} names={names} />
        </>
      }
      side={
        <>
          <Panel title="Details">
            <KeyValue
              items={[
                { label: "Requested by", value: own ? `You (${e.agreed.name})` : names(card.ownerEmail) },
                { label: "Committee", value: e.committeeName },
                { label: "Waiting on", value: card.status === "closed" || card.status === "cancelled" || card.status === "denied" ? null : officeAnswers ? `${STAGE_LABEL.slot}: the IAR office` : whoText(card, viewer, names) },
                {
                  label: "When",
                  value: e.recur ? (
                    <>
                      {recurText(e.date, e.recur)}
                      <div className="hint">{longDate(e.date)} to {longDate(e.recur.until)}</div>
                    </>
                  ) : (
                    dayText(e.date)
                  ),
                },
                { label: "Time", value: `${timeText(e.start)}–${timeText(e.end)}` },
                { label: "Room hold", value: e.rooms.length ? `${windowText(e)} (setup ${e.setup} min, cleanup ${e.teardown} min)` : null },
                {
                  label: "Room",
                  value: e.rooms.length ? (
                    <>
                      {roomNames.join(", ")}
                      {formerNames.length > 0 && <div className="hint">{formerNames.join(", ")}</div>}
                    </>
                  ) : (
                    "Off-site"
                  ),
                },
                { label: "Calendar", value: e.holds.length ? (e.holds.some((h) => h.status === "tentative") ? "Held (pending approval)" : "Confirmed") : null },
                { label: "Given up", value: (e.released ?? []).length ? (e.released ?? []).map(dayText).join(", ") : null },
                { label: "Expected", value: `${e.attendance} people` },
                { label: "Budget", value: e.budget ? fmtMoney(e.budget) : null },
                { label: "Public", value: e.isPublic ? "Yes" : "No" },
                { label: "Registration", value: e.registration ? "Yes" : "No" },
              ]}
            />
          </Panel>

          <Panel title={live ? "Checks now" : "Checks"} right={(() => {
            const s = checksSummary(live ? live.checks : e.checks);
            return s ? <Pill tone={s.tone}>{s.label}</Pill> : undefined;
          })()}>
            <ChecksList checks={live ? live.checks : e.checks} empty="No checks were saved with this request." />
            {live && live.clashes.some((c) => c.kind !== "pending") && <p className="hint">Something was booked in this room since it was sent. Send it back so the requester can pick another time.</p>}
            {!live && e.checks.length > 0 && <p className="hint">As checked when it was sent.</p>}
          </Panel>

          {calRoom && (
            <Panel title="Calendar">
              <Timeline items={calItems} request={holdWindow} caption={`${calRoom.name} · ${dayText(calDate)}`} />
            </Panel>
          )}
        </>
      }
    />
  );

  /**
   * What the person looking can do now. `main` is the one main button (approve,
   * or fix and resubmit), shown in the bottom bar; `panel` is the rest, at the
   * end of the page: the review note, sending back, declining, withdrawing.
   */
  function actionParts(): { panel: React.ReactNode; main?: React.ReactNode } {
    const cancel = can("cancel");
    const resubmit = own && can("resubmit");
    const addPurchase = own && (ec.status === "approved" || ec.status === "close_out");
    const renew = renewing?.can && ec.status === "approved";
    const again = canRequestAgain(ec, viewer, ctx.today);
    const reschedule = editing.ok;
    if (!reviewing && !cancel && !resubmit && !addPurchase && !renew && !again && !reschedule && !changeOk) {
      if (ec.status !== "in_review" || own) return { panel: null };
      const why = permission(ec, ev, "approve", directors);
      if (why.ok) return { panel: null };
      const who = e.stage === "director" ? reviewersFor(ec.ownerEmail, directors).map(names) : [];
      return { panel: <p className="hint">{why.reason}{who.length ? ` (${who.join(", ")})` : ""}</p> };
    }
    const main = reviewing ? (
      <Button variant="primary" icon="check" form="act-event" formAction={actOnEventWith.bind(null, "approve")} type="submit">Approve</Button>
    ) : changeOk ? (
      <Button href="#change" variant="primary">Review the new time</Button>
    ) : resubmit ? (
      <Button href={`/events/${ec.id}/edit`} variant="primary">{e.releasedFor ? "Pick a new time" : VERB.makeChanges}</Button>
    ) : undefined;
    const others = reviewing || addPurchase || renew || again || cancel || reschedule;
    if (!others) return { panel: null, main };
    const panel = (
      <form id="act-event" action={actOnEvent} className="stack">
        {base}
        {reviewing && (
          <Field label={`${STAGE_LABEL[e.stage]}: note`} hint={HINT.reviewNote}>
            <textarea name="note" rows={2} maxLength={1000} />
          </Field>
        )}
        <div className="row">
          {reviewing && <Button formAction={actOnEventWith.bind(null, "return")} type="submit">Send back</Button>}
          {reschedule && <Button href={`/events/${ec.id}/reschedule`} icon="calendar">Change date or time</Button>}
          {addPurchase && <Button href="/purchases/new" icon="receipt">Add a payment request</Button>}
          {renew && <Button href={`/events/${ec.id}/renew`} icon="repeat">Request the next period</Button>}
          {again && <Button href={`/events/new?from=${ec.id}`} icon="repeat" variant="quiet">Request this again</Button>}
          {(reviewing || addPurchase || renew || again || reschedule) && <span className="grow" />}
          {reviewing && (
            <ConfirmButton name="action" value="deny" variant="danger" title="Decline this request?" message="The requester sees your note. The room hold comes off the calendar." confirmLabel="Decline">
              Decline
            </ConfirmButton>
          )}
          {cancel && (
            <ConfirmButton name="action" value="cancel" variant="danger" title="Cancel this request?" message={e.holds.length ? "It comes off the IAR calendar and the room is freed for others." : "It's withdrawn and the teams stop working on it."} confirmLabel="Cancel the request" cancelLabel="Keep it">
              {own ? "Withdraw this request" : "Cancel this request"}
            </ConfirmButton>
          )}
        </div>
      </form>
    );
    return { panel, main };
  }

  /** A new date or time waiting for approval: the old and new values, and the director's answer (or the requester's withdraw). */
  function ChangePanel() {
    const c = e.change!;
    const changes = timeChanges(timeOf(e), timeOf(c), Boolean(e.recur));
    return (
      <Panel title="New time waiting for approval" right={<Pill tone="warn" status>{changeStep(ec, directors)}</Pill>} id="change">
        <form id="act-change" action={actOnEvent} className="stack">
          {base}
          <ul className="stack tight">
            {changes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="hint">Asked by {c.by === viewer.email.toLowerCase() ? "you" : names(c.by)} on {fmtDateTime(c.at)}. The approved time stays booked until it&apos;s approved.</p>
          {c.checks.length > 0 && (
            <Disclosure summary="Checks on the new time">
              <ChecksList checks={c.checks} />
            </Disclosure>
          )}
          {changeOk && (
            <>
              <Field label="Note for the requester" hint="Needed if you decline, so they know why.">
                <textarea name="note" rows={2} maxLength={1000} />
              </Field>
              <div className="row">
                <Button variant="primary" icon="check" type="submit" formAction={actOnEventWith.bind(null, "approve_change")}>Approve the new time</Button>
                <span className="grow" />
                <Button variant="danger" type="submit" formAction={actOnEventWith.bind(null, "decline_change")}>Decline</Button>
              </div>
            </>
          )}
          {own && (
            <div>
              <Button variant="quiet" size="small" type="submit" formAction={actOnEventWith.bind(null, "withdraw_change")}>Withdraw the new time</Button>
            </div>
          )}
          {!changeOk && !own && <p className="hint">Waiting on {changeApprovers(ec, directors).map(names).join(", ") || "an executive"}.</p>}
        </form>
      </Panel>
    );
  }

  /** The event's marketing pieces, each with its status and who has it, and a way to add one. */
  /** The event's A/V tickets, one per date, as IT works them in IT & Maintenance. */
  function AvPanel() {
    const rows = rowsFor(avVisible, actor, { names, today: ctx.today }).map((r, i) => {
      const t = avVisible[i];
      return { ...r, sub: t.ticket.eventDate ? dayText(t.ticket.eventDate) : r.sub, who: t.ticket.assigneeEmail && isTicketOpen(t.ticket) ? `With ${names(t.ticket.assigneeEmail)}` : r.who };
    });
    const hidden = avTickets.length - avVisible.length;
    const empty = isLive ? "No A/V tickets yet." : `Once the event is approved, IT Services gets an A/V ticket for ${e.dates.length > 1 ? `each of its ${e.dates.length} dates` : "it"}.`;
    return (
      <Panel title="A/V" right={avTickets.length ? `${avTickets.length}` : undefined} flush id="av">
        {avTickets.length === 0 ? (
          <EmptyState>{empty}</EmptyState>
        ) : (
          <Rows label="A/V tickets">
            {rows.map((r) => (
              <CardRow key={r.id} row={r} />
            ))}
            {hidden > 0 && <ItemRow state="plain" title={`${hidden} more you can't open`} sub="Restricted" />}
          </Rows>
        )}
      </Panel>
    );
  }

  function MarketingPanel() {
    const rows = rowsFor(piecesVisible, actor, { names, today: ctx.today }).map((r, i) => {
      const p = piecesVisible[i];
      const due = p.marketing.answers.due;
      return {
        ...r,
        sub: due ? `Needed by ${dayText(due)}` : r.sub,
        who: p.marketing.assignee && OPEN_STAGES.includes(p.marketing.stage) ? `With ${names(p.marketing.assignee)}` : r.who,
      };
    });
    const hidden = pieces.length - piecesVisible.length;
    const empty = !e.isPublic
      ? "Nothing yet. Private events usually don't need marketing, but you can ask for a sign or an announcement."
      : isLive
        ? "No marketing pieces yet."
        : "Nothing yet. Once the event is approved, marketing gets a flyer and announcement. Add pieces that take longer now: a video, a banner, social media posts.";
    return (
      <Panel title="Marketing" right={pieces.length ? `${pieces.length}` : undefined} flush id="marketing">
        {pieces.length === 0 ? (
          <EmptyState>{empty}</EmptyState>
        ) : (
          <Rows label="Marketing pieces">
            {rows.map((r) => (
              <CardRow key={r.id} row={r} />
            ))}
            {hidden > 0 && <ItemRow state="plain" title={`${hidden} more you can't open`} sub="Restricted" />}
          </Rows>
        )}
        {addPiece && (
          <PanelFoot>
            <Button href={`/marketing/new?event=${ec.id}`} icon="plus" size="small">
              Add a marketing piece
            </Button>
          </PanelFoot>
        )}
      </Panel>
    );
  }

  function SeriesPanel() {
    const r = e.recur!;
    return (
      <Panel title="Repeating series" right={`${e.dates.length} dates`}>
        <div className="stack">
          <div>
            {recurText(e.date, r)}. {ctx.today > r.until ? `Ended ${longDate(r.until)}.` : `Ends ${longDate(r.until)} (${daysBetween(ctx.today, r.until)} days left).`}
            {e.renews && <div className="hint">Renews <Link href={`/events/${e.renews}`}>{e.renews}</Link>.</div>}
          </div>
          {isEventCard(renewal) && renewal.status !== "denied" && renewal.status !== "cancelled" ? (
            <div>
              Next period requested: <Link href={`/events/${renewal.id}`}>{renewal.id}</Link> <Pill tone="info">{STATUS_LABEL[renewal.status]}</Pill>
            </div>
          ) : ec.status === "approved" && ctx.today <= r.until && !renewing?.can ? (
            <p className="hint">{ctx.today < renewalOpens(r) ? `Renewal opens ${longDate(renewalOpens(r))}, ${RENEW_DAYS} days before the series ends.` : renewing && !renewing.can ? renewing.why : ""}</p>
          ) : renewing?.can ? (
            <p className="hint">Renewal is open. It goes through the same checks and approval.</p>
          ) : null}
        </div>
      </Panel>
    );
  }

  function CloseOutPanel() {
    const c = e.closeOut;
    if (ec.status === "closed" && c) {
      return (
        <Panel title="Close-out" id="closeout">
          <KeyValue
            items={[
              { label: "Attendance", value: c.attendance !== undefined ? `${c.attendance} (expected ${e.attendance})` : "Not given" },
              { label: "Spent", value: <>{spendText(c.spent, e.budget)}{c.costsConfirmed ? <div className="hint">Final costs confirmed</div> : null}</> },
              { label: "Closed by", value: <>{c.by.includes("@") ? names(c.by) : c.by}{c.byOffice ? " (IAR office)" : ""}<div className="hint">{fmtDateTime(c.at)}</div></> },
              { label: "Deposit", value: c.depositRefund ? "Refund needed (finance was told)" : null },
              { label: "How it went", value: c.notes && <span className="pre">{c.notes}</span> },
            ]}
          />
        </Panel>
      );
    }
    const may = closeOutPermission(ec, ev).ok;
    return (
      <Panel title="Close out this event" id="closeout">
        {!may ? (
          <p className="hint">The event is over. It&apos;s waiting on {names(ec.ownerEmail)} for the attendance and final costs.</p>
        ) : (
          <form action={closeOutEvent} className={styles.closeout}>
            {base}
            <p className="hint">{own ? "The event is over. Tell us how it went and confirm the final costs. It takes a minute." : "You can close this out for the requester. Attendance and costs are optional for the office."}</p>
            <div className="grid two">
              <Field label="About how many people came?" hint={`You expected ${e.attendance}.`} required={own}>
                <input type="number" name="attendance" min={0} max={100000} defaultValue={own ? e.attendance : undefined} required={own} />
              </Field>
              <div>
                <div className="hint">Actual spend (from the payment requests linked to this event)</div>
                <strong>{spendText(spent, e.budget)}</strong>
                <div className="hint">{linked.length} payment request{linked.length === 1 ? "" : "s"} linked. Missing one? Edit it, or send it and pick this event.</div>
              </div>
            </div>
            <Field label="How did it go? What would you change next time?">
              <textarea name="notes" rows={3} maxLength={2000} placeholder="e.g. Good turnout. Order less pizza next time." />
            </Field>
            <Checkbox name="costsConfirmed" required={own}>These are all the costs for this event{own ? "" : " (the requester confirmed them)"}</Checkbox>
            {office && (
              <Checkbox name="depositRefund">A deposit should be refunded (MPH community events). The finance office is told.</Checkbox>
            )}
            <FormActions>
              <Button variant="primary" type="submit">{own ? "Close out the event" : "Close it out for them"}</Button>
            </FormActions>
          </form>
        )}
      </Panel>
    );
  }

  function AskPanel({ ask: a, cardId }: { ask: SlotRequest; cardId: string }) {
    const mine = a.requesterEmail === viewer.email.toLowerCase();
    const decide = canDecide(a, ev);
    const holderIsThis = a.hold.cardId === cardId;
    const slot = `${a.hold.room}, ${datesText(a.dates)}, ${timeText(a.hold.start)}–${timeText(a.hold.end)}`;
    return (
      <Panel
        title={holderIsThis ? `${a.requesterName} asks for your booked time` : `${mine ? "You" : a.requesterName} asked for a booked time`}
        right={<Pill tone={isOpenAsk(a) ? "warn" : a.status === "released" ? "ok" : "bad"} status>{SLOT_STATUS_LABEL[a.status]}</Pill>}
      >
        <div className="stack">
          <KeyValue
            items={[
              { label: "Time", value: slot },
              { label: "Held by", value: offPortal(a.hold) ? `${a.hold.label} (booked on the IAR calendar)` : a.hold.label },
              { label: "For", value: <Link href={`/events/${a.fromCard}`}>{a.fromCard}</Link> },
              { label: "Why", value: `“${a.reason}”` },
              { label: "Answer", value: a.choice ? `${CHOICE_LABEL[a.choice]}${a.note ? ` (“${a.note}”)` : ""}` : null },
            ]}
          />
          {decide && (
            <form action={decideAsk} className="stack">
              <input type="hidden" name="ask" value={a.id} />
              <input type="hidden" name="back" value={`/events/${cardId}`} />
              <Field label={`Note for ${a.requesterName} (optional)`}>
                <input name="note" maxLength={1000} placeholder="e.g. We can move to the following week" />
              </Field>
              <div className="row">
                {a.hold.cardId && <Button variant="primary" type="submit" formAction={decideAskWith.bind(null, "release_move")}>Give it up and move {a.hold.ownerEmail === viewer.email.toLowerCase() ? "my" : "the"} event</Button>}
                <Button variant={a.hold.cardId ? "default" : "primary"} type="submit" formAction={decideAskWith.bind(null, "release_cancel")}>Give it up and cancel {a.dates.length > 1 ? "those dates" : "it"}</Button>
                <Button type="submit" formAction={decideAskWith.bind(null, "keep")}>Keep it</Button>
              </div>
              {a.status === "escalated" && <Note>Nobody answered for 6 days, so it&apos;s yours to decide. The history records that you decided for them.</Note>}
            </form>
          )}
          {offPortal(a.hold) && isOpenAsk(a) && (
            <Note>
              {holderIsThis ? "" : "This booking came from the IAR calendar, not the portal, so the IAR office answers for it."} If nobody answers by {dayText(closesOn(a, e.dates[0]))}, the ask closes and {mine ? "you can" : "the requester can"} pick another time. Nothing is given up without an answer.
            </Note>
          )}
          {!offPortal(a.hold) && isOpenAsk(a) && mine && <p className="hint">If nobody answers by {dayText(closesOn(a, e.dates[0]))}, the ask closes and you can pick another time.</p>}
          {mine && isOpenAsk(a) && (
            <form action={withdrawAsk}>
              <input type="hidden" name="ask" value={a.id} />
              <Button variant="quiet" size="small" type="submit">Withdraw the ask</Button>
            </form>
          )}
          <Disclosure summary="History of this ask">
            <ol className={styles.history}>
              {a.history.map((h, i) => (
                <li key={i}>
                  <span />
                  <div className="hint">{h.text}</div>
                </li>
              ))}
            </ol>
          </Disclosure>
        </div>
      </Panel>
    );
  }
}

/** The room hold around the event: setup before, cleanup after. */
function holdTimes(start: string, end: string, setup: number, teardown: number) {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const fm = (m: number) => `${String(Math.floor(Math.max(0, m) / 60)).padStart(2, "0")}:${String(Math.max(0, m) % 60).padStart(2, "0")}`;
  return { start: fm(toMin(start) - setup), end: fm(Math.min(24 * 60 - 1, toMin(end) + teardown)) };
}
