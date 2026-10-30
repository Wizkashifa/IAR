import Link from "next/link";
import { mayDeleteRequests } from "@/lib/card-delete";
import { DeleteRequest } from "@/app/requests/DeleteRequest";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/Button";
import { ConfirmButton } from "@/components/Confirm";
import { Field } from "@/components/Field";
import { KeyValue } from "@/components/KeyValue";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { CommentsPanel, HistoryPanel } from "@/components/Activity";
import { FlashNote } from "@/components/FlashNote";
import { RequestPage } from "@/components/RequestPage";
import { canRequestAgain } from "@/lib/again";
import { cardStore } from "@/lib/cards";
import { ROW_TONE, emailsIn, rowState, whoText } from "@/lib/card-row";
import { mentionablePeople } from "@/lib/mentions";
import { nameResolver } from "@/lib/names";
import { nextStepText, stepsFor } from "@/lib/next-step";
import { requireViewer } from "@/lib/viewer";
import { rowStatusText } from "@/lib/status-text";
import { actorFor, peopleStore } from "@/lib/people";
import { isActive } from "@/lib/away";
import { accountLabel, findAccount, shortFund } from "@/lib/purchases/accounts";
import { purchaseContext } from "@/lib/purchases/settings";
import { KIND_LABEL, openExpectedReturns, paymentLabel, purchaseTotal, type Attachment } from "@/lib/purchases/types";
import { RETURN_TARGET_LABEL, approvingAsDirector, canViewDetail, coveringApprover, isPurchaseCard, permission, returnTargets, type Action, type PurchaseCard } from "@/lib/purchases/workflow";
import { actOnPurchase, commentOnPurchase } from "../actions";
import { OK_TEXT, WaitingPill, fmtDate, fmtMoney, fmtMonth, purchaseStatus } from "../ui";
import styles from "../purchases.module.css";
import { todayLocal } from "@/lib/dates";
import { Checkbox } from "@/components/Choices";
import { DataTable, cell } from "@/components/DataTable";
import { Disclosure } from "@/components/Disclosure";
import { FileList } from "@/components/FileList";
import { AddReceipts } from "../AddReceipts";
import { lineRows, merchantName } from "@/lib/purchases/statement";
import { fundsOf } from "@/lib/purchases/input";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** The request's title, for someone who may open it; anyone else sees the same as a missing page. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const viewer = await requireViewer();
  const [card, actor] = await Promise.all([(await cardStore()).get(id), actorFor(viewer)]);
  if (!isPurchaseCard(card) || !canViewDetail(card, { ...actor, seeAll: viewer.roles.includes("admins") })) return { title: "Payment request" };
  return { title: `${card.title} · ${card.id}` };
}


export default async function PurchaseDetail({ params, searchParams }: Params & { searchParams: Promise<{ ok?: string; error?: string; sent?: string }> }) {
  const [{ id }, { ok, error, sent }] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer();
  const [card, actor, ctx] = await Promise.all([(await cardStore()).get(id), actorFor(viewer), purchaseContext()]);
  // A request someone can't open looks the same as one that doesn't exist.
  if (!isPurchaseCard(card) || !canViewDetail(card, { ...actor, seeAll: viewer.roles.includes("admins") })) notFound();

  const pc: PurchaseCard = card;
  const p = card.purchase;
  const can = (a: Action) => permission(pc, actor, a).ok;
  const own = card.ownerEmail.toLowerCase() === viewer.email.toLowerCase();
  const isCard = p.kind === "card";
  // Card receipts: files for particular charges show with those charges; the rest are for the whole request.
  // Files for no charge on it now (including ones for charges no longer on it) are listed for the whole request.
  const wholeRequest = p.attachments.filter((a) => !a.refs?.some((r) => p.lines.some((l) => l.ref === r)));
  const receiptsFor = (lines: { ref?: string }[]) => p.attachments.filter((a) => a.refs?.some((r) => lines.some((l) => l.ref === r)));
  // Card receipts can charge several funds: name them all.
  const fundsLabel = isCard ? fundsOf(p.lines).map(shortFund).join(", ") || shortFund(p.fund) : shortFund(p.fund);
  const total = purchaseTotal(p);
  const owed = openExpectedReturns(p);
  const live = card.status === "in_review" || card.status === "approved" || card.status === "paid";
  const coveringFor = coveringApprover(pc, actor);
  const approverAway = live && p.stage === "chair" && p.approverEmail ? await (await peopleStore()).getAway(p.approverEmail) : null;
  const awayNow = approverAway && isActive(approverAway, todayLocal()) ? approverAway : null;
  const linkedEvent = p.eventCardId ? await (await cardStore()).get(p.eventCardId) : null;
  const finance = actor.roles.includes("finance");
  const names = await nameResolver([
    ...emailsIn([card]),
    ...(p.approverEmail ? [p.approverEmail] : []),
    ...p.history.map((h) => h.by),
    ...(card.comments ?? []).map((c) => c.by),
    ...(awayNow ? [awayNow.delegate] : []),
  ]);
  const opts = { executiveThreshold: ctx.routing.executiveThreshold };
  const steps = stepsFor(card, opts);
  const next = nextStepText(card, viewer, names, opts);
  // Who has it, with names instead of addresses ("You:" stays for the requester).
  const waiting = whoText(card, viewer, names);
  const receipts = p.lines.filter((l) => l.hasReceipt).length;
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const base = (
    <>
      {hidden("id", card.id)}
      {hidden("expected", card.updatedAt)}
    </>
  );

  const notes = (
    <>
      <FlashNote ok={ok} error={error} messages={OK_TEXT} />
      {p.relatedParty && <Note tone="warn">The requester says the payee is a Shura or committee member, a relative of one, or a business one owns. Review it with that in mind.</Note>}
      {p.w9Required && (
        <Note tone="warn">
          A W-9 is needed before payment, because this is labor or services.{" "}
          {p.w9Uploaded ? (
            <>
              The requester uploaded it to the restricted W-9 drive (
              {finance && p.w9Uploaded.driveFileId ? (
                <a href={`https://drive.google.com/file/d/${p.w9Uploaded.driveFileId}/view`} target="_blank" rel="noreferrer">
                  {p.w9Uploaded.name}
                </a>
              ) : (
                p.w9Uploaded.name
              )}
              ). The finance office checks it before approving.
            </>
          ) : (
            "None was uploaded with this request."
          )}
        </Note>
      )}
      {live && p.returnNote && (
        <Note tone="warn">
          <strong>Sent back:</strong> {p.returnNote}
        </Note>
      )}
      {card.status === "changes_requested" && p.returnNote && (
        <Note tone="warn">
          <strong>Sent back for changes:</strong> {p.returnNote}
          {own && can("resubmit") && (
            <>
              {" "}
              <Link href={`/purchases/${card.id}/edit`}>Make the changes and send it again</Link>
            </>
          )}
        </Note>
      )}
      {approvingAsDirector(pc, actor) && live && (
        <Note>
          This is waiting on {p.approverEmail ? names(p.approverEmail) : "the chair"}. As the committee&apos;s director you can approve, send back or decline it too; it&apos;s recorded as your decision as director.
        </Note>
      )}
      {coveringFor && live && <Note>You&apos;re covering approvals for {names(coveringFor)} while they&apos;re away. Your approval is recorded as on their behalf.</Note>}
      {!coveringFor && awayNow && (
        <Note>
          {awayNow.name} is away until {fmtDate(`${awayNow.until}T12:00:00Z`)}. {names(awayNow.delegate)} is covering their approvals.
        </Note>
      )}
      {card.status === "denied" && p.returnNote && (
        <Note tone="bad">
          <strong>Declined:</strong> {p.returnNote}
        </Note>
      )}
    </>
  );

  const main = (
    <>
      <Panel title={isCard ? "Charges" : "Line items"} right={<strong>{fmtMoney(total)}</strong>} flush>
        <DataTable compact>
          <thead>
            <tr>
              {isCard && <th>Date</th>}
              <th>{isCard ? "Merchant and sub-account" : "Sub-account"}</th>
              <th className={cell.num}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineRows(p.lines).map((row) => {
              if ("group" in row) {
                const acct = findAccount(row.lines[0].accountId);
                const sum = Math.round(row.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
                return (
                  <tr key={`g-${row.group}`}>
                    <td data-label="Date" className={`${cell.nowrap} ${cell.date}`}>
                      {row.lines.length} charges
                    </td>
                    <td data-label="Charge">
                      <strong>{row.group}</strong>
                      <span className={cell.sub}>
                        {accountLabel(acct)}
                        {acct && acct.fund !== p.fund && ` (${shortFund(acct.fund)})`}
                      </span>
                      {row.lines[0].note && <span className={cell.sub}>{row.lines[0].note}</span>}
                      <ChargeFiles files={receiptsFor(row.lines)} />
                      {row.lines.some((l) => !l.hasReceipt) && (
                        <span className={styles.tags}>
                          <Pill tone="warn">No receipt</Pill>
                        </span>
                      )}
                      <Disclosure summary={`See the ${row.lines.length} charges`}>
                        <DataTable compact caption={`${row.group} charges`}>
                          <tbody>
                            {row.lines.map((l) => (
                              <tr key={l.id}>
                                <td data-label="Charge">
                                  <span className={`${cell.nowrap} ${cell.date}`}>{l.date && fmtDate(`${l.date}T12:00:00Z`)}</span> {l.merchant}
                                </td>
                                <td data-label="Amount" className={cell.num}>
                                  {fmtMoney(l.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </DataTable>
                      </Disclosure>
                    </td>
                    <td data-label="Amount" className={cell.num}>
                      {fmtMoney(sum)}
                    </td>
                  </tr>
                );
              }
              const l = row.line;
              const acct = findAccount(l.accountId);
              return (
                <tr key={l.id}>
                  {isCard && (
                    <td data-label="Date" className={`${cell.nowrap} ${cell.date}`}>
                      {l.date && fmtDate(`${l.date}T12:00:00Z`)}
                    </td>
                  )}
                  <td data-label={isCard ? "Charge" : "Sub-account"}>
                    {isCard && <strong>{l.ref && l.merchant ? merchantName(l.merchant) : l.merchant}</strong>}
                    {isCard && l.ref && <span className={cell.sub}>{l.merchant}</span>}
                    <span className={isCard ? cell.sub : undefined}>
                      {accountLabel(acct)}
                      {acct && acct.fund !== p.fund && ` (${shortFund(acct.fund)})`}
                    </span>
                    {l.note && <span className={cell.sub}>{l.note}</span>}
                    {isCard && <ChargeFiles files={receiptsFor([l])} />}
                    {(!l.hasReceipt || l.flag || l.amount < 0) && (
                      <span className={styles.tags}>
                        {l.amount < 0 && <Pill tone="info">Credit</Pill>}
                        {!l.hasReceipt && <Pill tone="warn">No receipt</Pill>}
                        {l.flag === "refund" && <Pill tone={l.resolvedAt ? "ok" : "info"}>{l.resolvedAt ? "Refund received" : "Refund pending"}</Pill>}
                        {l.flag === "repay" && <Pill tone={l.resolvedAt ? "ok" : "info"}>{l.resolvedAt ? `Repaid by ${l.repayBy}` : `To be repaid by ${l.repayBy}`}</Pill>}
                        {l.flag && !l.resolvedAt && can("resolve") && (
                          <form action={actOnPurchase}>
                            {base}
                            {hidden("action", "resolve")}
                            {hidden("line", l.id)}
                            <Button type="submit" size="small">
                              Mark received
                            </Button>
                          </form>
                        )}
                      </span>
                    )}
                  </td>
                  <td data-label="Amount" className={cell.num}>
                    {fmtMoney(l.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              {isCard && <td />}
              <td>
                Total
                {owed.length > 0 && <span className={cell.sub}>{fmtMoney(owed.reduce((s, l) => s + l.amount, 0))} expected back</span>}
              </td>
              <td className={cell.num}>{fmtMoney(total)}</td>
            </tr>
          </tfoot>
        </DataTable>
      </Panel>

      <Panel title={isCard ? "Other files" : "Receipts and files"} right={`${wholeRequest.length}`}>
        <div className="stack">
          <FileList files={wholeRequest} empty={isCard ? "Each charge's receipts are with the charge above." : "No files attached."} />
          {can("attach") && <AddReceipts action={actOnPurchase} fields={base} />}
        </div>
      </Panel>

      <CommentsPanel id={card.id} comments={card.comments} names={names} action={commentOnPurchase} people={await mentionablePeople(card)} me={viewer.email} />
      <HistoryPanel entries={p.history} names={names} />
    </>
  );

  const side = (
    <Panel title="Details">
      <KeyValue
        items={[
          { label: "Requested by", value: names(card.ownerEmail) },
          { label: "Fund", value: p.fund },
          { label: "Waiting on", value: live || card.status === "changes_requested" ? waiting || "Nothing" : "Nothing" },
          { label: "Card", value: p.card && `···${p.card.last4} · ${fmtMonth(p.card.statementMonth)} statement` },
          { label: "Pay to", value: !isCard && p.payee },
          { label: "Invoice", value: p.invoiceNumber },
          {
            label: "Payment",
            value: p.delivery && (
              <>
                {paymentLabel(p.delivery)}
                {p.mailingAddress && <span className={`${cell.sub} ${styles.said}`}>{p.mailingAddress}</span>}
              </>
            ),
          },
          { label: "W-9", value: p.w9Required && <Pill tone={p.w9Uploaded ? "info" : "warn"}>{p.w9Uploaded ? "Uploaded · finance checks it" : "Needed"}</Pill> },
          {
            label: "Event",
            value: p.eventCardId && (
              <>
                <Link href={`/events/${p.eventCardId}`}>{linkedEvent?.title ?? p.eventCardId}</Link>
                <span className={cell.sub}>
                  {p.eventCardId}
                  {linkedEvent?.eventDate ? ` · ${fmtDate(`${linkedEvent.eventDate}T12:00:00Z`)}` : ""}
                </span>
              </>
            ),
          },
          { label: "Receipts", value: !isCard && <Pill tone={receipts === p.lines.length && p.attachments.length > 0 ? "ok" : "warn"}>{p.attachments.length} file{p.attachments.length === 1 ? "" : "s"} attached</Pill> },
          { label: "Sent", value: fmtDate(card.createdAt ?? p.attestation.at) },
          { label: "Paid", value: p.payment && `${p.payment.method} ${p.payment.reference} · ${fmtDate(p.payment.at)}` },
        ]}
      />
    </Panel>
  );

  const act = actionParts();
  return (
    <RequestPage
      crumb={{ href: "/purchases", label: "Payments" }}
      admin={mayDeleteRequests(viewer) ? <DeleteRequest id={card.id} /> : undefined}
      id={card.id}
      title={card.title}
      pills={
        <>
          <Pill tone={ROW_TONE[rowState(card, actor)]} status>
            {purchaseStatus(card)}
          </Pill>
          {p.restricted && <Pill tone="bad">Restricted</Pill>}
          <WaitingPill card={card} />
        </>
      }
      lead={[KIND_LABEL[p.kind], fundsLabel, `from ${names(card.ownerEmail)}`, fmtMoney(total)]}
      steps={steps}
      next={next}
      sent={sent === "1"}
      notes={notes}
      actions={act.panel}
      bar={act.main ? { label: rowStatusText(card, rowState(card, actor)), main: act.main } : undefined}
      decide={act.decide}
      main={main}
      side={side}
    />
  );

  /**
   * What the person looking can do now. `main` is the one main button in the
   * bottom bar: approving or marking it entered sends its form straight away;
   * recording a payment (and approving when a W-9 has to be confirmed) needs
   * fields first, so the bar jumps to `decide`, a panel with those fields and
   * the real button. `panel` is the rest, at the end of the page: the note,
   * sending back, declining, cancelling.
   */
  function actionParts(): { panel: React.ReactNode; main?: React.ReactNode; decide?: { title: string; body: React.ReactNode } } {
    const approve = can("approve");
    const pay = can("pay");
    const books = can("books");
    const cancel = can("cancel");
    const sendBack = can("return");
    const targets = returnTargets(pc);
    const returnTo = targets.length > 1 && (
      <Field label="Send back to">
        <select name="returnTo" defaultValue="requester">
          {targets.map((t) => (
            <option key={t} value={t}>
              {RETURN_TARGET_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
    );
    const again = canRequestAgain(pc, viewer, todayLocal()) && (
      <div className="row">
        <Button href={`/purchases/new?from=${pc.id}`} icon="repeat" variant="quiet">
          Request this again
        </Button>
      </div>
    );
    if (!approve && !pay && !books && !cancel && !sendBack) {
      if (again) return { panel: again };
      const why = live && !own ? permission(pc, actor, p.stage === "payment" ? "pay" : p.stage === "books" ? "books" : "approve") : null;
      return { panel: why && !why.ok ? <p className="hint">{why.reason}</p> : null };
    }
    const approveLabel = p.stage === "chair" ? `Approve for ${shortFund(p.fund)}` : p.stage === "finance" ? (isCard ? "Approve the charges" : "Approve for payment") : "Approve";
    // Approving at the finance step can need the W-9 box ticked first: then the approve form is the action's own panel.
    const w9First = approve && p.stage === "finance" && p.w9Required;
    const jump = (label: string) => (
      <Button href="#request-decide" variant="primary" icon="chevD">
        {label}
      </Button>
    );
    const main = approve ? (
      w9First ? (
        jump(approveLabel)
      ) : (
        <Button type="submit" form="act-approve" name="action" value="approve" variant="primary" icon="check">
          {approveLabel}
        </Button>
      )
    ) : pay ? (
      jump("Record payment")
    ) : books ? (
      <form action={actOnPurchase}>
        {base}
        {hidden("action", "books")}
        <Button type="submit" variant="primary" icon="check">
          Mark entered in QuickBooks
        </Button>
      </form>
    ) : undefined;
    const approveForm = approve && (
      <form id="act-approve" action={actOnPurchase} className="stack">
        {base}
        <div className="grid">
          <Field label="Note" hint="Optional with Approve; needed to send it back or decline it. Everyone on the request sees it.">
            <textarea name="note" rows={2} maxLength={1000} />
          </Field>
          {returnTo}
        </div>
        {p.stage === "finance" && p.w9Required && (
          <Checkbox name="w9Received">The W-9 is on file in the restricted W-9 drive</Checkbox>
        )}
        <div className="row">
          {w9First && (
            <Button type="submit" name="action" value="approve" variant="primary" icon="check">
              {approveLabel}
            </Button>
          )}
          <Button type="submit" name="action" value="return">
            Send back
          </Button>
          <ConfirmButton variant="danger" name="action" value="reject" title="Decline this request?" message="It ends here and the requester is told why. Add your reason in the note first." confirmLabel="Decline" cancelLabel="Go back">
            Decline
          </ConfirmButton>
        </div>
      </form>
    );
    const payForm = pay && (
      <form id="act-pay" action={actOnPurchase} className="stack">
        {base}
        {p.payment && (
          <Note tone="warn">
            It was already paid once: {p.payment.method} {p.payment.reference} on {fmtDate(p.payment.at)}. Don&apos;t pay it again; record that same payment.
          </Note>
        )}
        <div className="grid">
          <Field label="How it was paid">
            <select name="method" defaultValue={p.delivery === "ach" ? "ACH" : "Check"}>
              <option>Check</option>
              <option>ACH</option>
              <option>Bill pay</option>
            </select>
          </Field>
          <Field label="Check number or ACH reference" required>
            <input name="reference" required maxLength={60} />
          </Field>
        </div>
        <div className="row end">
          <ConfirmButton variant="primary" name="action" value="pay" title="Record this payment?" message={`${fmtMoney(total)} to ${p.payee ?? names(pc.ownerEmail)}. The requester is told it is paid.`} confirmLabel="Record payment" cancelLabel="Go back">
            Record payment
          </ConfirmButton>
        </div>
      </form>
    );
    const panel = (
      <div className="stack">
        {approve && !w9First && approveForm}

        {sendBack && !approve && (
          <Disclosure summary="Something wrong? Send it back" open={!pay && !books}>
            <form action={actOnPurchase} className="stack">
              {base}
              {hidden("action", "return")}
              <div className="grid">
                <Field label="What needs fixing" required>
                  <textarea name="note" rows={2} maxLength={1000} required />
                </Field>
                {returnTo}
              </div>
              <div className="row">
                <Button type="submit">Send back</Button>
              </div>
            </form>
          </Disclosure>
        )}

        {cancel && (
          <form action={actOnPurchase} className="row">
            {base}
            <ConfirmButton variant="danger" name="action" value="cancel" title="Cancel this request?" message="It's withdrawn and nobody needs to act on it. You can't undo this." confirmLabel="Cancel the request" cancelLabel="Keep it">
              Cancel this request
            </ConfirmButton>
          </form>
        )}

        {again}
      </div>
    );
    // Marking it entered needs nothing else: with no other options, there's no panel, just the bar.
    const other = (approve && !w9First) || (sendBack && !approve) || cancel || again;
    const decide = payForm ? { title: "Record the payment", body: payForm } : w9First ? { title: "Approve it", body: approveForm } : undefined;
    return { panel: other ? panel : null, main, decide };
  }
}

/** A charge's own receipts, under it in the charges table. */
function ChargeFiles({ files }: { files: Attachment[] }) {
  if (files.length === 0) return null;
  return (
    <div className={styles.chargeFiles}>
      <FileList files={files} empty="" />
    </div>
  );
}
