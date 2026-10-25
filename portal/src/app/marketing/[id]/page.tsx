import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canRequestAgain } from "@/lib/again";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { actorFor } from "@/lib/people";
import { todayLocal } from "@/lib/dates";
import { nameResolver } from "@/lib/names";
import { ROW_TONE, rowState, whoText } from "@/lib/card-row";
import { nextStepText, stepsFor } from "@/lib/next-step";
import { statusText } from "@/lib/status-text";
import { MARKETING_TYPES, answerText, neededBy } from "@/lib/marketing/forms";
import { canViewMarketing } from "@/lib/marketing/access";
import { daysUntilNeeded, isMarketingCard, isTight, permission, suggestedDoneBy, type Action, type MarketingCard } from "@/lib/marketing/workflow";
import { Button } from "@/components/Button";
import { ConfirmButton } from "@/components/Confirm";
import { DateField } from "@/components/DateField";
import { Field } from "@/components/Field";
import { KeyValue } from "@/components/KeyValue";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { RequestPage } from "@/components/RequestPage";
import { fmtDate, fmtDay } from "@/lib/format";
import { FileDrop } from "@/components/FileDrop";
import { FILE_ACCEPT, MAX_FILE_MB, MAX_PER_UPLOAD, filesOf, sizeText } from "@/lib/marketing/files";
import { marketingFolder } from "@/lib/marketing/drive";
import { actOnMarketing, addMarketingFiles, commentOnMarketing } from "../actions";
import { CommentsPanel, HistoryPanel } from "@/components/Activity";
import { FlashNote } from "@/components/FlashNote";
import { OK_MESSAGES } from "../ui";
import styles from "../marketing.module.css";

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
  const names = await nameResolver([mc.ownerEmail, ...(m.assignee ? [m.assignee] : []), ...m.history.map((h) => h.by), ...(mc.comments ?? []).map((c) => c.by), ...filesOf(m).map((f) => f.by)]);
  const requester = own ? "you" : names(mc.ownerEmail);
  const tone = ROW_TONE[rowState(mc, actor, { today })];
  const files = filesOf(m);
  const uploads = Boolean(await marketingFolder());

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
      {m.stage === "done" && m.doneNote && (
        <Note tone="ok">
          <strong>Done:</strong> <span className="pre">{m.doneNote}</span>
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
              { label: "Google Drive link", value: m.driveLink ? <a href={m.driveLink} target="_blank" rel="noreferrer">{m.driveLink}</a> : null },
              { label: "Comments from the requester", value: m.notes ? <span className="pre">{m.notes}</span> : null },
            ]}
          />
          {own && can("edit") && m.stage === "review" && (
            <p className={styles.sideNote}>
              Need to change something? <Link href={`/marketing/${mc.id}/edit`}>Edit the request</Link> until marketing schedules it.
            </p>
          )}
        </div>
      </Panel>
      <FilesPanel />
      <CommentsPanel id={mc.id} comments={mc.comments} names={names} action={commentOnMarketing} />
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
          { label: "Waiting on", value: (own ? mc.waitingOn : whoText(mc, viewer, names)) ?? null },
        ]}
      />
    </Panel>
  );

  return (
    <>
      <RequestPage
        crumb={{ href: "/marketing", label: "Marketing Requests" }}
        id={mc.id}
        title={mc.title}
        pills={
          <Pill tone={tone} dot>
            {statusText(mc)}
          </Pill>
        }
        lead={[t.label, mc.committee, `from ${requester}`, due && `needed by ${fmtDay(due)}`]}
        steps={stepsFor(mc, { today })}
        next={nextStepText(mc, viewer, names, { today })}
        sent={sent === "1"}
        notes={notes}
        actions={Actions() ?? undefined}
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
          {files.length === 0 ? (
            <p className={styles.quiet}>No files yet.{m.driveLink ? " The requester shared a Google Drive link above." : ""}</p>
          ) : (
            <ul className={styles.files}>
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {f.name}
                    </a>
                  ) : (
                    <span>{f.name}</span>
                  )}
                  <span className={styles.when}>
                    {sizeText(f.size)} · {f.by.toLowerCase() === viewer.email.toLowerCase() ? "you" : names(f.by)}, {fmtDate(f.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
              <p className={styles.sideNote}>File uploads for marketing aren&apos;t set up yet. Share files with a Google Drive link in a comment.</p>
            ))}
        </div>
      </Panel>
    );
  }

  /** The buttons for the person looking, in one row, with the fields they share underneath. */
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
        <form action={actOnMarketing} className="stack">
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

    if (can("schedule") || can("ask")) {
      return (
        <form action={actOnMarketing} className="stack">
          {base}
          <div className="row">
            <Button type="submit" name="action" value="schedule" variant="primary">
              Schedule
            </Button>
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

    if (can("start") || can("finish") || can("reschedule")) {
      return (
        <form action={actOnMarketing} className="stack">
          {base}
          <div className="row">
            {can("start") && (
              <Button type="submit" name="action" value="start" variant="primary">
                Start
              </Button>
            )}
            {can("finish") && (
              <Button type="submit" name="action" value="finish" variant={can("start") ? "default" : "primary"}>
                Mark done
              </Button>
            )}
            {can("reschedule") && (
              <Button type="submit" name="action" value="reschedule">
                Change date
              </Button>
            )}
            {declineButton}
          </div>
          <div className="grid split">
            {can("reschedule") && <DateField name="doneBy" label="Done by" defaultValue={m.doneBy ?? null} min={today} />}
            <Field label={m.stage === "doing" ? "Link to the finished work, or a note (optional)" : "Note (optional)"} hint="Sent to the requester.">
              <input name="note" maxLength={2000} />
            </Field>
          </div>
        </form>
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
