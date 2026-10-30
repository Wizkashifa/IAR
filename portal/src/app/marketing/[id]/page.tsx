import type { Metadata } from "next";
import { mayDeleteRequests } from "@/lib/card-delete";
import { DeleteRequest } from "@/app/requests/DeleteRequest";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canRequestAgain } from "@/lib/again";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { actorFor } from "@/lib/people";
import { todayLocal } from "@/lib/dates";
import { mentionablePeople } from "@/lib/mentions";
import { nameResolver } from "@/lib/names";
import { ROW_TONE, rowState, whoText } from "@/lib/card-row";
import { nextStepText, stepsFor } from "@/lib/next-step";
import { rowStatusText, statusText } from "@/lib/status-text";
import { MARKETING_TYPES, answerText, driveLinkOf, neededBy } from "@/lib/marketing/forms";
import { canViewMarketing } from "@/lib/marketing/access";
import { approvalDue, channelText, daysUntilNeeded, isMarketingCard, isTight, latestProof, permission, suggestedDoneBy, type Action, type MarketingCard } from "@/lib/marketing/workflow";
import { CHANNELS, CHANNEL_LABEL } from "@/lib/marketing/types";
import { Choice, Choices } from "@/components/Choices";
import { Button } from "@/components/Button";
import { ConfirmButton } from "@/components/Confirm";
import { DateField } from "@/components/DateField";
import { Field } from "@/components/Field";
import { KeyValue } from "@/components/KeyValue";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { RequestPage } from "@/components/RequestPage";
import { fmtDate, fmtDay, fmtDayTime } from "@/lib/format";
import { FileDrop } from "@/components/FileDrop";
import { FILE_ACCEPT, MAX_FILE_MB, MAX_PER_UPLOAD, filesOf } from "@/lib/marketing/files";
import { marketingFolder } from "@/lib/marketing/drive";
import { actOnMarketing, addMarketingFiles, commentOnMarketing, sendMarketingProof } from "../actions";
import { CommentsPanel, HistoryPanel } from "@/components/Activity";
import { FlashNote } from "@/components/FlashNote";
import { OK_MESSAGES } from "../ui";
import styles from "../marketing.module.css";
import { FileList } from "@/components/FileList";
import { same } from "@/lib/text";
import { queueTeamMembers } from "@/lib/groups";
import { Disclosure } from "@/components/Disclosure";
import { PeoplePicker } from "@/components/PeoplePicker";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `${id} · Marketing` };
}

export default async function MarketingDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; sent?: string }>;
}) {
  const [{ id }, { ok, error, sent }] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer();
  const [card, actor] = await Promise.all([(await cardStore()).get(id), actorFor(viewer)]);
  // A request someone can't open looks the same as one that doesn't exist.
  if (!isMarketingCard(card) || !canViewMarketing(card, { ...actor, seeAll: viewer.roles.includes("admins") })) notFound();

  const mc: MarketingCard = card;
  const m = mc.marketing;
  const t = MARKETING_TYPES[m.kind];
  const today = todayLocal();
  const can = (a: Action) => permission(mc, actor, a).ok;
  const own = mc.ownerEmail.toLowerCase() === viewer.email.toLowerCase();
  const due = neededBy(m.answers);
  const days = daysUntilNeeded(mc, today);
  // Who on the marketing team the work can be handed to.
  const team = permission(mc, actor, "assign").ok ? await queueTeamMembers("marketing") : [];
  const names = await nameResolver([mc.ownerEmail, ...(m.assignee ? [m.assignee] : []), ...team, ...m.history.map((h) => h.by), ...(mc.comments ?? []).map((c) => c.by), ...filesOf(m).map((f) => f.by)]);
  const requester = own ? "you" : names(mc.ownerEmail);
  const state = rowState(mc, actor, { today });
  const tone = ROW_TONE[state];
  const files = filesOf(m);
  const drive = driveLinkOf(m);
  const uploads = Boolean(await marketingFolder());
  const channels = channelText(m.channels);
  const proof = latestProof(m);
  const approvalBy = approvalDue(m);

  // Why a marketing member can't review this one (their own request).
  const why = m.stage === "review" && actor.roles.includes("marketing") ? permission(mc, actor, "schedule") : null;
  const whyNot = why && !why.ok ? why.reason : null;

  const notes = (
    <>
      <FlashNote ok={ok} error={error} messages={OK_MESSAGES} />
      {m.stage === "question" && m.question && (
        <Note tone="warn">
          <strong>Marketing asked:</strong> <span className="pre">{m.question}</span>
        </Note>
      )}
      {m.stage === "declined" && m.declineReason && (
        <Note tone="bad">
          <strong>Declined:</strong> <span className="pre">{m.declineReason}</span>
        </Note>
      )}
      {m.stage === "doing" && m.changesAsked && (
        <Note tone="warn">
          <strong>{own ? "You asked for changes:" : `${names(mc.ownerEmail)} asked for changes:`}</strong> <span className="pre">{m.changesAsked}</span>
        </Note>
      )}
      {m.stage === "proof" && <ProofPanel />}
      {m.stage === "done" && (m.doneNote || channels) && (
        <Note tone="ok">
          {channels && (
            <p>
              <strong>Went out on:</strong> {channels}
            </p>
          )}
          {m.doneNote && (
            <p>
              <strong>{channels ? "Note:" : "Done:"}</strong> <span className="pre">{m.doneNote}</span>
            </p>
          )}
        </Note>
      )}
      {isTight(mc, today) && days !== null && (
        <Note tone="warn">
          {days === 0 ? "Needed today." : `Needed in ${days} day${days === 1 ? "" : "s"}.`} Marketing usually takes 1–2 weeks, so this may not be ready in time.
        </Note>
      )}
      {whyNot && <Note>{whyNot}</Note>}
    </>
  );

  const main = (
    <>
      <Panel title="The request">
        <div className="stack">
          <KeyValue
            stacked
            items={[
              ...t.fields.map((f) => {
                const v = m.answers[f.key];
                return {
                  label: f.label,
                  value: !v ? null : f.kind === "url" ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : f.kind === "date" ? fmtDay(v) : <span className="pre">{answerText(f, v)}</span>,
                };
              }),
              { label: "Google Drive link", value: drive ? <a href={drive} target="_blank" rel="noreferrer">{drive}</a> : null },
              { label: "Comments from the requester", value: m.notes ? <span className="pre">{m.notes}</span> : null },
            ]}
          />
          {own && can("edit") && m.stage === "review" && (
            <p className="hint">
              Need to change something? <Link href={`/marketing/${mc.id}/edit`}>Edit the request</Link> until marketing schedules it.
            </p>
          )}
        </div>
      </Panel>
      <FilesPanel />
      <CommentsPanel id={mc.id} comments={mc.comments} names={names} action={commentOnMarketing} people={await mentionablePeople(mc)} me={viewer.email} />
      <HistoryPanel entries={m.history} names={names} />
    </>
  );

  const side = (
    <Panel title="Details">
      <KeyValue
        items={[
          { label: "Requested by", value: names(mc.ownerEmail) },
          { label: "Committee", value: mc.committee },
          { label: "Type", value: t.label },
          { label: "Submitted", value: fmtDate(mc.createdAt ?? m.history[0]?.at ?? mc.updatedAt) },
          { label: "Needed by", value: due ? fmtDay(due) : null },
          { label: m.stage === "done" ? "Was due" : "Marketing aims to finish", value: m.doneBy && m.stage !== "declined" ? fmtDay(m.doneBy) : null },
          { label: "Worked on by", value: m.assignee ? names(m.assignee) : null },
          { label: "Went out on", value: channels || null },
          { label: "Waiting on", value: (own ? mc.waitingOn : whoText(mc, viewer, names)) ?? null },
        ]}
      />
    </Panel>
  );

  // The one main button, in the bottom bar. Starting needs nothing else, so it sends the form (id act-mk) straight away;
  // answering, approving, scheduling, sending a draft and marking it as marketed need fields, so the bar jumps to their own panel (`decide`).
  const jump = (label: string) => (
    <Button href="#request-decide" variant="primary" icon="chevD">
      {label}
    </Button>
  );
  const ownPanel = can("answer")
    ? { title: "Your answer", button: "Send answer" }
    : can("approve")
      ? { title: "Approve the draft", button: "Approve" }
      : can("schedule")
        ? { title: "Schedule it", button: "Schedule" }
        : can("sendProof")
          ? { title: "Send for approval", button: "Send for approval" }
          : !can("start") && can("finish")
            ? { title: "Mark as marketed", button: "Mark as marketed" }
            : null;
  const barMain = ownPanel ? (
    jump(ownPanel.button)
  ) : can("start") ? (
    <Button type="submit" form="act-mk" name="action" value="start" variant="primary">
      Start
    </Button>
  ) : undefined;
  const actionsBody = Actions() ?? undefined;

  return (
    <>
      <RequestPage
        crumb={{ href: "/marketing", label: "Marketing Requests" }}
        admin={mayDeleteRequests(viewer) ? <DeleteRequest id={mc.id} /> : undefined}
        id={mc.id}
        title={mc.title}
        pills={
          <Pill tone={tone} status>
            {statusText(mc)}
          </Pill>
        }
        lead={[t.label, mc.committee, `from ${requester}`, due && `needed by ${fmtDay(due)}`]}
        steps={stepsFor(mc, { today })}
        next={nextStepText(mc, viewer, names, { today })}
        sent={sent === "1"}
        notes={notes}
        actions={ownPanel ? undefined : actionsBody}
        bar={barMain ? { label: rowStatusText(mc, state), main: barMain } : undefined}
        decide={ownPanel ? { title: ownPanel.title, body: actionsBody } : undefined}
        main={main}
        side={side}
      />
    </>
  );

  /** Files on the request, and a way for the requester and the marketing team to add more. */
  function FilesPanel() {
    const canAdd = can("files");
    if (files.length === 0 && !canAdd) return null;
    return (
      <Panel title="Files" right={files.length ? `${files.length}` : undefined} id="files">
        <div className="stack">
          <FileList files={files.map((f) => ({ ...f, by: same(f.by, viewer.email) ? "you" : names(f.by) }))} empty={`No files yet.${drive ? " The requester shared a Google Drive link above." : ""}`} />
          {canAdd &&
            (uploads ? (
              <form action={addMarketingFiles} className="stack">
                <input type="hidden" name="id" value={mc.id} />
                <FileDrop name="files" label="Add files" hint={`Up to ${MAX_PER_UPLOAD} files at a time, ${MAX_FILE_MB} MB each. Marketing and the requester can open them here.`} accept={FILE_ACCEPT} maxFiles={MAX_PER_UPLOAD} maxSizeMb={MAX_FILE_MB} camera />
                <div>
                  <Button type="submit">Add files</Button>
                </div>
              </form>
            ) : (
              <p className="hint">File uploads for marketing aren&apos;t set up yet. Share files with a Google Drive link in a comment.</p>
            ))}
        </div>
      </Panel>
    );
  }

  /** The draft marketing sent for approval, at the top of the page while it waits on the requester. */
  function ProofPanel() {
    const by = approvalBy ? fmtDayTime(approvalBy) : "the next business day";
    const late = !own && can("finish");
    const lead = own
      ? `Look at the draft, then approve it or ask for changes at the end of this page by ${by}. With no answer by then, marketing can go ahead.`
      : late
        ? `${names(mc.ownerEmail)} didn't answer by ${by}. You can go ahead and mark it as marketed without their approval.`
        : `Waiting on ${names(mc.ownerEmail)} to approve it or ask for changes, until ${by}. After that, marketing can go ahead without their approval.`;
    return (
      <Panel title={own ? "Marketing's draft for you to approve" : "Draft sent for approval"} right={proof.length ? `${proof.length}` : undefined}>
        <div className="stack">
          <p className="hint">{lead}</p>
          {m.proofNote && (
            <p>
              <strong>From marketing:</strong> <span className="pre">{m.proofNote}</span>
            </p>
          )}
          <FileList files={proof.map((f) => ({ ...f, by: same(f.by, viewer.email) ? "you" : names(f.by) }))} empty="No draft files." />
        </div>
      </Panel>
    );
  }

  /** The rest of what the person looking can do, at the end of the page, with the fields the bar's main button sends too (form act-mk). */
  function Actions() {
    const base = (
      <>
        <input type="hidden" name="id" value={mc.id} />
        <input type="hidden" name="expected" value={mc.updatedAt} />
      </>
    );
    const declineButton = can("decline") && (
      <ConfirmButton name="action" value="decline" variant="danger" danger title="Decline this request?" message={`${requester === "you" ? "You're" : `${names(mc.ownerEmail)} is`} told it was declined, with the note below as the reason.`} confirmLabel="Decline">
        Decline
      </ConfirmButton>
    );

    // The requester answers marketing's question in place.
    if (can("answer")) {
      return (
        <form id="act-mk" action={actOnMarketing} className="stack">
          {base}
          <div className={styles.answerBox}>
            <Field label="Your answer to marketing" required>
              <textarea name="note" rows={3} maxLength={2000} required />
            </Field>
          </div>
          <div className="row">
            <Button type="submit" name="action" value="answer" variant="primary">
              Send answer
            </Button>
            <Button href={`/marketing/${mc.id}/edit`}>Edit the request too</Button>
            {can("cancel") && (
              <span className="push">
                <ConfirmButton name="action" value="cancel" variant="quiet" danger title="Cancel this request?" message="Marketing won't work on it. You can always send a new request." confirmLabel="Cancel request" cancelLabel="Keep it">
                  Cancel request
                </ConfirmButton>
              </span>
            )}
          </div>
        </form>
      );
    }

    // The requester approves marketing's draft (shown at the top of the page) or asks for changes.
    if (can("approve")) {
      return (
        <form id="act-mk" action={actOnMarketing} className="stack">
          {base}
          <div className={styles.answerBox}>
            <Field label="What should change?" hint="Only needed if you ask for changes. Marketing sees it on the request.">
              <textarea name="note" rows={3} maxLength={2000} />
            </Field>
          </div>
          <div className="row">
            <Button type="submit" name="action" value="approve" variant="primary">
              Approve
            </Button>
            <Button type="submit" name="action" value="changes">
              Ask for changes
            </Button>
          </div>
        </form>
      );
    }

    if (can("schedule") || can("ask")) {
      return (
        <form id="act-mk" action={actOnMarketing} className="stack">
          {base}
          <div className="row">
            {can("schedule") && (
              <Button type="submit" name="action" value="schedule" variant="primary">
                Schedule
              </Button>
            )}
            <Button type="submit" name="action" value="ask">
              Ask a question
            </Button>
            {declineButton}
          </div>
          <div className="grid split">
            <DateField name="doneBy" label="Done by (when scheduling)" defaultValue={suggestedDoneBy(mc, today)} min={today} />
            <Field label="Note, question or reason" hint="Optional when scheduling. Sent to the requester.">
              <input name="note" maxLength={2000} placeholder="e.g. Which size: banner or poster?" />
            </Field>
          </div>
        </form>
      );
    }

    if (can("start") || can("finish") || can("reschedule") || can("sendProof")) {
      const others = team.filter((e) => !same(e, m.assignee));
      const finishing = can("finish");
      const work = (
        <form id="act-mk" action={actOnMarketing} className="stack">
          {base}
          {finishing && (
            <Choices legend="Where did it go out?" hint="Tick every place it was posted. Leave them all empty for something that isn't posted, like a badge or a sign.">
              {CHANNELS.map((c) => (
                <Choice key={c} type="checkbox" name="channels" value={c} label={CHANNEL_LABEL[c]} />
              ))}
            </Choices>
          )}
          <div className="grid split">
            {can("reschedule") && <DateField name="doneBy" label="Done by" defaultValue={m.doneBy ?? null} min={today} />}
            <Field label={finishing ? "Link to where it went out, or a note (optional)" : "Note (optional)"} hint="Sent to the requester.">
              <input name="note" maxLength={2000} />
            </Field>
          </div>
          <div className="row">
            {/* Start is the bar's one-tap button; Mark as marketed is this panel's main button when there's nothing to start. */}
            {finishing && (
              <Button type="submit" name="action" value="finish" variant={can("start") ? "default" : "primary"}>
                Mark as marketed
              </Button>
            )}
            {can("reschedule") && (
              <Button type="submit" name="action" value="reschedule">
                Change date
              </Button>
            )}
            {declineButton}
          </div>
        </form>
      );
      // With only the date left to change (in progress, or waiting on approval), it folds away under the main step.
      const onlyDate = !finishing && !can("start");
      return (
        <div className="stack">
          {can("sendProof") &&
            (uploads ? (
              <form action={sendMarketingProof} className="stack">
                <input type="hidden" name="id" value={mc.id} />
                <FileDrop name="files" label="The draft" required hint={`What the requester should look at: the design, a photo of the sign, or the wording. Up to ${MAX_PER_UPLOAD} files, ${MAX_FILE_MB} MB each.`} accept={FILE_ACCEPT} maxFiles={MAX_PER_UPLOAD} maxSizeMb={MAX_FILE_MB} />
                <div className={styles.answerBox}>
                  <Field label="Note for the requester (optional)">
                    <textarea name="note" rows={2} maxLength={2000} />
                  </Field>
                </div>
                <div>
                  <Button type="submit" variant="primary">
                    Send for approval
                  </Button>
                </div>
              </form>
            ) : (
              <Note>File uploads for marketing aren&apos;t set up yet, so a draft can&apos;t be sent from here. Ask a portal admin to set them up.</Note>
            ))}
          {onlyDate ? (
            can("reschedule") && (
              <Disclosure summary="Change the done-by date" button="quiet">
                {work}
              </Disclosure>
            )
          ) : (
            work
          )}
          {can("assign") && others.length > 0 && (
            <Disclosure summary={m.assignee ? "Hand to someone else" : "Give to someone"} button="quiet">
              <form action={actOnMarketing} className="stack">
                {base}
                <input type="hidden" name="action" value="assign" />
                <PeoplePicker name="assignee" label="Who on the marketing team should work on it" required people={others.map((e) => ({ email: e, name: same(e, viewer.email) ? `Me (${names(e)})` : names(e) }))} />
                <div>
                  <Button type="submit">Hand it over</Button>
                </div>
              </form>
            </Disclosure>
          )}
        </div>
      );
    }

    if (can("decline")) {
      return (
        <form action={actOnMarketing} className="stack">
          {base}
          <div className="row">{declineButton}</div>
          <div className={styles.answerBox}>
            <Field label="Why marketing can't take this on">
              <input name="note" maxLength={2000} />
            </Field>
          </div>
        </form>
      );
    }

    if (can("edit") || can("cancel")) {
      return (
        <form action={actOnMarketing} className="row">
          {base}
          {can("edit") && <Button href={`/marketing/${mc.id}/edit`}>Edit the request</Button>}
          {can("cancel") && (
            <span className="push">
              <ConfirmButton name="action" value="cancel" variant="quiet" danger title="Cancel this request?" message="Marketing won't work on it. You can always send a new request." confirmLabel="Cancel request" cancelLabel="Keep it">
                Cancel request
              </ConfirmButton>
            </span>
          )}
        </form>
      );
    }
    if (canRequestAgain(mc, viewer, today)) {
      return (
        <div className="row">
          <Button href={`/marketing/new?type=${m.kind}&from=${mc.id}`} icon="repeat" variant="quiet">
            Request this again
          </Button>
        </div>
      );
    }
    return null;
  }
}
