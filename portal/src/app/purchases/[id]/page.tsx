import Link from "next/link";
import { notFound } from "next/navigation";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { actorFor, peopleStore } from "@/lib/people";
import { isActive, todayLocal } from "@/lib/away";
import { accountLabel, findAccount } from "@/lib/purchases/accounts";
import { DELIVERY_LABEL, KIND_LABEL, STAGE_LABEL, openExpectedReturns, purchaseTotal } from "@/lib/purchases/types";
import { approvingAsDirector, canViewDetail, coveringApprover, daysWaiting, isPurchaseCard, permission, type Action } from "@/lib/purchases/workflow";
import { actOnPurchase, actOnPurchaseWith, commentOnPurchase } from "../actions";
import { COMMENT_MAX } from "@/lib/comments";
import { Flash, StatusPill, fmtDate, fmtDateTime, fmtMoney, fmtMonth } from "../ui";

export const dynamic = "force-dynamic";

export default async function PurchaseDetail({
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
  if (!isPurchaseCard(card) || !canViewDetail(card, { ...actor, seeAll: viewer.roles.includes("admins") })) notFound();

  const pc = card;
  const p = card.purchase;
  const can = (a: Action) => permission(pc, actor, a).ok;
  const own = card.ownerEmail.toLowerCase() === viewer.email.toLowerCase();
  const card_ = p.kind === "card";
  const total = purchaseTotal(p);
  const owed = openExpectedReturns(p);
  const live = card.status === "in_review" || card.status === "approved" || card.status === "paid";
  const coveringFor = coveringApprover(pc, actor);
  const approverAway = live && p.stage === "chair" && p.approverEmail ? await (await peopleStore()).getAway(p.approverEmail) : null;
  const awayNow = approverAway && isActive(approverAway, todayLocal()) ? approverAway : null;
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
        <Link href="/purchases">Purchase Requests</Link>
      </p>
      <div className="pagehead">
        <div>
          <h1>{card.title}</h1>
          <p className="lead">
            {card.id} · {KIND_LABEL[p.kind]} · {fmtMoney(total)}
          </p>
        </div>
        <div className="pills">
          <StatusPill card={card} />
          {p.restricted && <span className="pill restricted">Restricted</span>}
        </div>
      </div>
      <Flash ok={ok} error={error} />

      {p.relatedParty && (
        <div className="callout warn">The requester says the payee is a Shura or committee member, a relative of one, or a business one owns. Review it with that in mind.</div>
      )}
      {p.w9Required && <div className="callout warn">W-9 needed before payment: {p.isLabor ? "this is labor or services" : "IAR hasn't paid this payee before"}.</div>}
      {card.status === "changes_requested" && p.returnNote && (
        <div className="callout warn">
          <strong>Returned for changes:</strong> {p.returnNote}
          {own && can("resubmit") && (
            <>
              {" "}
              <Link href={`/purchases/${card.id}/edit`}>Edit and resubmit</Link>
            </>
          )}
        </div>
      )}
      {approvingAsDirector(pc, actor) && live && <div className="callout info">This is waiting on {p.approverEmail}. As the committee&apos;s director you can approve, return or reject it too; it&apos;s recorded as your decision as director.</div>}
      {coveringFor && live && <div className="callout info">You&apos;re covering approvals for {coveringFor} while they&apos;re away. Your approval is recorded as on their behalf.</div>}
      {!coveringFor && awayNow && (
        <div className="callout info">
          {awayNow.name} is away until {fmtDate(`${awayNow.until}T12:00:00Z`)}. {awayNow.delegate} is covering their approvals.
        </div>
      )}
      {card.status === "denied" && p.returnNote && <div className="callout bad"><strong>Rejected:</strong> {p.returnNote}</div>}

      <div className="detail">
        <section>
          <dl className="facts">
            <div><dt>Requester</dt><dd>{p.attestation.name} <span className="sub">{card.ownerEmail}</span></dd></div>
            <div><dt>Fund</dt><dd>{p.fund}</dd></div>
            {p.card && <div><dt>Card</dt><dd>···{p.card.last4} · {fmtMonth(p.card.statementMonth)} statement</dd></div>}
            {p.payee && <div><dt>Payee</dt><dd>{p.payee}</dd></div>}
            {p.invoiceNumber && <div><dt>Invoice</dt><dd>{p.invoiceNumber}</dd></div>}
            {p.delivery && <div><dt>Payment</dt><dd>{DELIVERY_LABEL[p.delivery]}{p.mailingAddress && <div className="sub pre">{p.mailingAddress}</div>}</dd></div>}
            <div><dt>Submitted</dt><dd>{fmtDate(card.createdAt ?? p.attestation.at)}</dd></div>
            <div>
              <dt>Now</dt>
              <dd>
                {card.status === "changes_requested" ? "Back with the requester" : STAGE_LABEL[p.stage]}
                {card.waitingOn && <div className="sub">{card.waitingOn}{live ? ` · ${daysWaiting(card)} day${daysWaiting(card) === 1 ? "" : "s"}` : ""}</div>}
              </dd>
            </div>
            {p.payment && <div><dt>Paid</dt><dd>{p.payment.method} {p.payment.reference} <span className="sub">{fmtDate(p.payment.at)}</span></dd></div>}
          </dl>

          <h2>{card_ ? "Charges" : "Line items"}</h2>
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  {card_ && <th>Date</th>}
                  <th>{card_ ? "Merchant / sub-account" : "Sub-account"}</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {p.lines.map((l) => (
                  <tr key={l.id}>
                    {card_ && <td className="sub nowrap">{l.date && fmtDate(`${l.date}T12:00:00Z`)}</td>}
                    <td>
                      {card_ && <strong>{l.merchant}</strong>}
                      <div className={card_ ? "sub" : ""}>{accountLabel(findAccount(l.accountId))}{findAccount(l.accountId)?.fund !== p.fund && ` (${findAccount(l.accountId)?.fund})`}</div>
                      {l.note && <div className="sub">{l.note}</div>}
                      <div className="tags">
                        {!l.hasReceipt && <span className="tag warn">No receipt</span>}
                        {l.flag === "refund" && <span className={`tag ${l.resolvedAt ? "ok" : "info"}`}>{l.resolvedAt ? "Refund received" : "Refund pending"}</span>}
                        {l.flag === "repay" && <span className={`tag ${l.resolvedAt ? "ok" : "info"}`}>{l.resolvedAt ? `Repaid by ${l.repayBy}` : `To be repaid by ${l.repayBy}`}</span>}
                        {l.flag && !l.resolvedAt && can("resolve") && (
                          <form action={actOnPurchase} className="inlineform">
                            {base}
                            {hidden("action", "resolve")}
                            {hidden("line", l.id)}
                            <button className="linkbtn" type="submit">Mark received</button>
                          </form>
                        )}
                      </div>
                    </td>
                    <td className="num">{fmtMoney(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  {card_ && <td />}
                  <td><strong>Total</strong>{owed.length > 0 && <div className="sub">{fmtMoney(owed.reduce((s, l) => s + l.amount, 0))} expected back</div>}</td>
                  <td className="num"><strong>{fmtMoney(total)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <h2>Files</h2>
          {p.attachments.length === 0 ? (
            <p className="sub">No files attached.</p>
          ) : (
            <ul className="files">
              {p.attachments.map((a, i) => (
                <li key={`${a.name}-${i}`}>{a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a> : a.name} <span className="sub">{Math.ceil(a.size / 1024)} KB</span></li>
              ))}
            </ul>
          )}
        </section>

        <aside>
          <Actions />
          <h2 id="comments">Comments</h2>
          {(card.comments ?? []).length === 0 ? (
            <p className="note">No comments yet. Ask a question or add context; everyone who can open this request sees it.</p>
          ) : (
            <ol className="history">
              {(card.comments ?? []).map((c) => (
                <li key={c.id}>
                  <div><strong>{c.name}</strong> <span className="sub">{fmtDateTime(c.at)}</span></div>
                  <div className="hnote pre">{c.text}</div>
                </li>
              ))}
            </ol>
          )}
          <form action={commentOnPurchase} className="stack">
            {hidden("id", card.id)}
            <label className="field">
              <span>Add a comment</span>
              <textarea name="text" rows={3} maxLength={COMMENT_MAX} required />
            </label>
            <div>
              <button className="button secondary" type="submit">Comment</button>
            </div>
          </form>
          <h2>History</h2>
          <ol className="history">
            {[...p.history].reverse().map((h, i) => (
              <li key={i}>
                <div><strong>{h.action}</strong></div>
                <div className="sub">{h.by} · {fmtDateTime(h.at)}</div>
                {h.note && <div className="hnote">{h.note}</div>}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );

  function Actions() {
    const approve = can("approve");
    const pay = can("pay");
    const books = can("books");
    const cancel = can("cancel");
    if (!approve && !pay && !books && !cancel) {
      const why = live && !own ? permission(pc, actor, p.stage === "payment" ? "pay" : p.stage === "books" ? "books" : "approve") : null;
      return why && !why.ok ? <div className="panel sub">{why.reason}</div> : null;
    }
    return (
      <div className="panel actions">
        {approve && (
          <>
            <h3>{STAGE_LABEL[p.stage]}</h3>
            <form action={actOnPurchase} className="stack">
              {base}
              <label className="field">
                <span>Note (required to return or reject)</span>
                <textarea name="note" rows={2} maxLength={1000} />
              </label>
              {p.stage === "finance" && p.w9Required && (
                <label className="inline">
                  <input type="checkbox" name="w9Received" /> W-9 is on file in the restricted W-9 drive
                </label>
              )}
              <div className="row">
                <button className="button" formAction={actOnPurchaseWith.bind(null, "approve")} type="submit">Approve</button>
                <button className="button secondary" formAction={actOnPurchaseWith.bind(null, "return")} type="submit">Return for changes</button>
                <button className="button secondary danger" formAction={actOnPurchaseWith.bind(null, "reject")} type="submit">Reject</button>
              </div>
            </form>
          </>
        )}
        {pay && (
          <>
            <h3>Record payment</h3>
            <form action={actOnPurchase} className="stack">
              {base}
              {hidden("action", "pay")}
              <label className="field">
                <span>Method</span>
                <select name="method" defaultValue={p.delivery === "ach" ? "ACH" : "Check"}>
                  <option>Check</option>
                  <option>ACH</option>
                  <option>Bill pay</option>
                </select>
              </label>
              <label className="field">
                <span>Check number or ACH reference</span>
                <input name="reference" required maxLength={60} />
              </label>
              <button className="button" type="submit">Mark paid</button>
            </form>
          </>
        )}
        {books && (
          <>
            <h3>QuickBooks</h3>
            <form action={actOnPurchase}>
              {base}
              {hidden("action", "books")}
              <button className="button" type="submit">Mark entered in QuickBooks</button>
            </form>
          </>
        )}
        {cancel && (
          <form action={actOnPurchase} className="cancelform">
            {base}
            {hidden("action", "cancel")}
            <button className="linkbtn danger" type="submit">Cancel this request</button>
          </form>
        )}
      </div>
    );
  }
}
