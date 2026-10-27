import type { Metadata } from "next";
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
import { ItemRow, Rows } from "@/components/ItemRow";
import { RequestPage } from "@/components/RequestPage";
import { agendaBetween } from "@/lib/agenda";
import { ROW_TONE, rowState, whoText } from "@/lib/card-row";
import { cardStore } from "@/lib/cards";
import { STATUS_LABEL } from "@/lib/glossary";
import { canOpenCard } from "@/lib/access";
import { canRequestAgain } from "@/lib/again";
import { nameResolver } from "@/lib/names";
import { nextStepText, stepsFor } from "@/lib/next-step";
import { statusText } from "@/lib/status-text";
import { requireViewer } from "@/lib/viewer";
import { busyFor, eventAccess, eventContext, mayBookRestricted } from "@/lib/events/context";
import { AV_INCLUDES, AV_KINDS } from "@/lib/events/input";
import { roomById } from "@/lib/events/rooms";
import { eventChecks, eventFlags, missionReasons, windowText } from "@/lib/events/rules";
import { dayText, longDate, recurText, timeText } from "@/lib/events/series";
import { CHOICE_LABEL, SLOT_STATUS_LABEL, type SlotRequest, canDecide, datesText, isOpenAsk } from "@/lib/events/slot-requests";
import { STAGE_LABEL, isEventCard, permission, reviewersFor, type EventAction } from "@/lib/events/workflow";
import { RENEW_DAYS, renewalOpens, renewalState } from "@/lib/events/renewal";
import { closeOutPermission, linkedPurchases, spendOf, spendText } from "@/lib/events/closeout";
import { mayCheckRooms, roomCheckFor } from "@/lib/events/roomchecks";
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
import { CheckResult, RoomCheckCell, TaskLine } from "../ops-ui";
import { roomDay } from "../calendar";
import { ChecksList, Timeline, checksSummary } from "../ui";
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
  commented: "Comment added. The people on this request can see it.",
  "task-taken": "It's yours. It shows your name on the event.",
  "task-started": "Marked in progress.",
  "task-done": "Marked done. The requester can see it here.",
  "task-asked": "Question sent as a comment on the event. The requester gets an alert.",
  "task-assigned": "Handed over. They get an alert, and their name shows here.",
  "check-ok": "Room check saved.",
  "check-problem": "Room check saved. The requester and the IAR office have been told about the problem.",
  "closed-out": "Closed out. Thank you! The event is now closed.",
  images: "Images added. Marketing can open them here and in the marketing Shared Drive.",
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
  const roomNames = e.rooms.map((r) => roomById(ctx.rooms, r)?.name ?? r);
  const reasons = missionReasons(e);
  const renewal = e.renewedBy ? await store.get(e.renewedBy) : null;
  const renewing = e.recur ? renewalState(card, { email: viewer.email, office: viewer.actingRoles.includes("office") }, ctx.today, isEventCard(renewal) ? renewal : null) : null;
  const tasks = tasksFor(card);
  const isLive = card.status === "approved" || card.status === "close_out" || card.status === "closed";
  // Room checks happen on the day: dates so far (and today).
  const checkDates = isLive && e.rooms.length ? e.dates.filter((d) => d <= ctx.today || (e.roomChecks ?? []).some((r) => r.date === d)) : [];
  const linked = linkedPurchases(await store.listPurchasesForEvent(card.id), card.id);
  const linkedVisible = linked.filter((p) => canOpenCard(p, { ...actor, seeAll: viewer.roles.includes("admins") }));
  const spent = spendOf(linked);
  const office = ev.roles.includes("office");
  const images = imagesOf(card);
  const canAddImages = imagesPermission(card, ev).ok;
  const uploads = canAddImages && Boolean(await marketingFolder());

  // Who each team's tasks can be handed to, for the teams this person works on.
  const myTeams = isLive ? TASK_TEAMS.filter((t) => worksTeam(t, viewer.actingRoles) && tasks.some((x) => x.team === t)) : [];
  const teamMembers = new Map(await Promise.all(myTeams.map(async (t) => [t, await queueTeamMembers(t)] as const)));

  // Everyone this page shows, by name.
  const emails = [...[...teamMembers.values()].flat(), card.ownerEmail, ...directors, ...e.history.map((h) => h.by), ...tasks.map((t) => t.assignee ?? ""), ...images.map((f) => f.by), ...(card.waitingOn?.match(/[^\s:,()]+@[^\s:,()]+/g) ?? [])].filter((x) => x.includes("@"));
  const names = await nameResolver(emails);
  const opts = { today: ctx.today, directors };
  const steps = stepsFor(card, opts);
  const next = nextStepText(card, viewer, names, opts);
  const tone = ROW_TONE[rowState(card, actor, { today: ctx.today, ctx: { directorsOf: ctx.directorsOf } })];

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
      <FlashNote ok={ok} error={error} messages={MESSAGES} />
      {card.status === "changes_requested" && (
        <Note tone="warn">
          <strong>{e.releasedFor ? "You gave up this time:" : "Sent back for changes:"}</strong> {e.returnNote}
          {own && can("resubmit") && (
            <>
              {" "}
              <Link href={`/events/${card.id}/edit`}>{e.releasedFor ? "Pick a new time" : "Edit and resubmit"}</Link>
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
      {e.stage === "slot" && card.status === "submitted" && <Note>This request is waiting for an answer to an ask for a booked time (below). It goes to mission review once the time is given up.</Note>}
      {reviewing && reasons.length > 0 && <Note>Look closely at this one: {reasons.join(", ")}.</Note>}
    </>
  );

  return (
    <RequestPage
      crumb={{ href: "/events", label: "Events & Rooms" }}
      id={card.id}
      title={card.title}
      pills={
        <>
          <Pill tone={tone} dot>{statusText(card)}</Pill>
          {eventFlags(e).map((f) => (
            <Pill key={f} tone="gold">{f}</Pill>
          ))}
        </>
      }
      lead={["Event", e.committeeName, `from ${own ? "you" : names(card.ownerEmail)}`, e.recur ? `${recurText(e.date, e.recur)}, ${e.dates.length} dates` : dayText(e.date), `${timeText(e.start)}–${timeText(e.end)}`, roomNames.join(", ") || "Off-site"]}
      steps={steps}
      next={next}
      sent={sent === "1"}
      notes={notes}
      actions={<Actions />}
      main={
        <>
          <Panel title="About the event">
            <p className={styles.about}>{e.description}</p>
            {e.setupNotes && <p className="hint">Setup plan: {e.setupNotes}</p>}
          </Panel>

          {e.isPublic && e.brief && (
            <Panel title="Marketing brief">
              <KeyValue
                items={[
                  { label: "Subtitle", value: e.brief.subtitle },
                  { label: "Announcement", value: <span className="pre">{e.brief.text}</span> },
                  { label: "On the flyer", value: e.brief.flyer && <span className="pre">{e.brief.flyer}</span> },
                  { label: "Registration", value: e.brief.regLink },
                  { label: "Payment", value: e.brief.payment && <span className="pre">{e.brief.payment}</span> },
                  { label: "Files", value: e.brief.files && <a href={e.brief.files} target="_blank" rel="noreferrer">Drive folder</a> },
                ]}
              />
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
                      <FileDrop name="images" label="Add images" hint={`Photos, logos or artwork as image files (JPG, PNG, HEIC). No PDFs or Word documents. Up to ${MAX_PER_UPLOAD} at a time, ${MAX_FILE_MB} MB each.`} accept={IMAGE_ACCEPT} maxFiles={MAX_PER_UPLOAD} maxSizeMb={MAX_FILE_MB} camera />
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
            <Panel title="Team tasks" right={tasks.every((t) => t.status === "locked") ? "Unlocks on approval" : `${tasks.filter((t) => t.status === "done").length} of ${tasks.length} done`} flush id="tasks">
              <Rows>
                {tasks.map((t) => (
                  <TaskLine key={t.id} card={ec} task={t} roles={viewer.actingRoles} email={viewer.email} back={`/events/${card.id}#tasks`} today={ctx.today} names={names} people={(teamMembers.get(t.team) ?? []).map((m) => ({ email: m, name: m === viewer.email.toLowerCase() ? `Me (${names(m)})` : names(m) }))} />
                ))}
              </Rows>
              {tasks.every((t) => t.status === "locked") && <PanelFoot>Each team gets its task in Team Queues once the event is approved.</PanelFoot>}
            </Panel>
          )}

          {checkDates.length > 0 && (
            <Panel title="Room checks" flush id="roomchecks">
              <Rows>
                {checkDates.map((d) => (
                  <ItemRow
                    key={d}
                    state="plain"
                    title={dayText(d)}
                    right={
                      <div className={styles.cells}>
                        <RoomCheckCell card={ec} date={d} when="before" check={roomCheckFor(ec, d, "before")} roles={viewer.actingRoles} back={`/events/${card.id}#roomchecks`} />
                        <RoomCheckCell card={ec} date={d} when="after" check={roomCheckFor(ec, d, "after")} roles={viewer.actingRoles} back={`/events/${card.id}#roomchecks`} />
                      </div>
                    }
                  />
                ))}
              </Rows>
              <PanelFoot>Security checks the room before and after the event.{mayCheckRooms(ev) ? " Record each check here or on the run sheet." : ""}</PanelFoot>
            </Panel>
          )}

          {(linked.length > 0 || card.status === "approved" || card.status === "close_out") && (
            <Panel title="Purchases for this event" right={e.budget ? `Budget ${fmtMoney(e.budget)}` : undefined} flush id="purchases">
              {linked.length === 0 ? (
                <EmptyState icon="receipt">None linked yet. When you send a purchase request for this event, pick it under “Which event is this for?”.</EmptyState>
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
                {own && (card.status === "approved" || card.status === "close_out") ? <> · <Link href="/purchases/new">New purchase request</Link></> : null}
              </PanelFoot>
            </Panel>
          )}

          {asks.length > 0 && (
            <section className="stack" id="asks" aria-label="Asks for a booked time">
              {asks.map((a) => (
                <AskPanel key={a.id} ask={a} cardId={card.id} />
              ))}
            </section>
          )}

          <CommentsPanel id={card.id} comments={card.comments} names={names} action={commentOnEvent} />
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
                { label: "Waiting on", value: card.status === "closed" || card.status === "cancelled" || card.status === "denied" ? null : whoText(card, viewer, names) },
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
                { label: "Room", value: roomNames.join(", ") || "Off-site" },
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

  function Actions() {
    const cancel = can("cancel");
    const resubmit = own && can("resubmit");
    const addPurchase = own && (ec.status === "approved" || ec.status === "close_out");
    const renew = renewing?.can && ec.status === "approved";
    const again = canRequestAgain(ec, viewer, ctx.today);
    if (!reviewing && !cancel && !resubmit && !addPurchase && !renew && !again) {
      if (ec.status !== "in_review" || own) return null;
      const why = permission(ec, ev, "approve", directors);
      if (why.ok) return null;
      const who = e.stage === "director" ? reviewersFor(ec.ownerEmail, directors).map(names) : [];
      return <p className="hint">{why.reason}{who.length ? ` (${who.join(", ")})` : ""}</p>;
    }
    return (
      <form action={actOnEvent} className="stack">
        {base}
        {reviewing && (
          <Field label={`${STAGE_LABEL[e.stage]}: note`} hint="Required to send it back or decline it. The requester sees it.">
            <textarea name="note" rows={2} maxLength={1000} />
          </Field>
        )}
        <div className="row">
          {reviewing && (
            <>
              <Button variant="primary" icon="check" formAction={actOnEventWith.bind(null, "approve")} type="submit">Approve</Button>
              <Button formAction={actOnEventWith.bind(null, "return")} type="submit">Send back</Button>
            </>
          )}
          {resubmit && <Button href={`/events/${ec.id}/edit`} variant="primary">{e.releasedFor ? "Pick a new time" : "Edit and resubmit"}</Button>}
          {addPurchase && <Button href="/purchases/new" icon="receipt">Add a purchase request</Button>}
          {renew && <Button href={`/events/${ec.id}/renew`} icon="repeat">Request the next period</Button>}
          {again && <Button href={`/events/new?from=${ec.id}`} icon="repeat" variant="quiet">Request this again</Button>}
          {(reviewing || resubmit || addPurchase || renew || again) && <span className="grow" />}
          {reviewing && (
            <ConfirmButton name="action" value="deny" variant="danger" danger title="Decline this request?" message="The requester sees your note. The room hold comes off the calendar." confirmLabel="Decline">
              Decline
            </ConfirmButton>
          )}
          {cancel && (
            <ConfirmButton name="action" value="cancel" variant="danger" danger title="Cancel this request?" message={e.holds.length ? "It comes off the IAR calendar and the room is freed for others." : "It's withdrawn and the teams stop working on it."} confirmLabel="Cancel the request" cancelLabel="Keep it">
              {own ? "Withdraw this request" : "Cancel this request"}
            </ConfirmButton>
          )}
        </div>
      </form>
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
    const checks = e.roomChecks ?? [];
    const checkSummary = checks.length ? (
      <Rows>
        {checks.map((r) => (
          <li key={`${r.date}-${r.when}`}>
            {dayText(r.date)}, {r.when}: <CheckResult check={r} />
          </li>
        ))}
      </Rows>
    ) : (
      <span className="hint">No room checks recorded.</span>
    );
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
              { label: "Room checks", value: checkSummary },
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
                <div className="hint">Actual spend (from the purchases linked to this event)</div>
                <strong>{spendText(spent, e.budget)}</strong>
                <div className="hint">{linked.length} purchase request{linked.length === 1 ? "" : "s"} linked. Missing one? Edit it, or send it and pick this event.</div>
              </div>
            </div>
            <div>
              <div className="hint">Room condition (from security)</div>
              {checkSummary}
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
        right={<Pill tone={isOpenAsk(a) ? "warn" : a.status === "released" ? "ok" : "bad"} dot>{SLOT_STATUS_LABEL[a.status]}</Pill>}
      >
        <div className="stack">
          <KeyValue
            items={[
              { label: "Time", value: slot },
              { label: "Held by", value: a.hold.label },
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
