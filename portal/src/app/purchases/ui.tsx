import Link from "next/link";
import { STATUS_LABEL } from "@/lib/cards";
import { shortFund } from "@/lib/purchases/accounts";
import { KIND_LABEL, STAGE_LABEL, purchaseTotal } from "@/lib/purchases/types";
import { ESCALATE_DAYS, REMINDER_DAYS, daysWaiting, type PurchaseCard } from "@/lib/purchases/workflow";

export const fmtMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
export const fmtMonth = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function StatusPill({ card }: { card: PurchaseCard }) {
  return <span className={`pill ${card.status}`}>{STATUS_LABEL[card.status]}</span>;
}

/** Stage plus how long it has sat there, highlighted once a reminder or escalation is due. */
export function StageCell({ card }: { card: PurchaseCard }) {
  const open = card.status === "in_review" || card.status === "approved" || card.status === "paid";
  const days = daysWaiting(card);
  const cls = !open ? "" : days >= ESCALATE_DAYS ? "late" : days >= REMINDER_DAYS ? "due" : "";
  return (
    <>
      {card.status === "changes_requested" ? "Back with requester" : STAGE_LABEL[card.purchase.stage]}
      {open && <div className={`sub ${cls}`}>{days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}</div>}
    </>
  );
}

/**
 * One row in a purchase table. `redact` hides payee and description for
 * Social & Welfare requests the viewer can't open.
 */
export function PurchaseRow({ card, redact, showOwner }: { card: PurchaseCard; redact?: boolean; showOwner?: boolean }) {
  const p = card.purchase;
  return (
    <tr>
      <td>
        {redact ? (
          <>
            <strong>Social &amp; Welfare request</strong>
            <div className="sub">{card.id} · details restricted to S&amp;W and finance</div>
          </>
        ) : (
          <>
            <Link href={`/purchases/${card.id}`}>
              <strong>{card.title}</strong>
            </Link>
            <div className="sub">
              {card.id} · {KIND_LABEL[p.kind]}
              {p.payee && p.kind === "pay" ? ` · ${p.payee}` : ""}
              {p.card ? ` · card ···${p.card.last4}, ${fmtMonth(p.card.statementMonth)}` : ""}
              {showOwner ? ` · ${card.ownerEmail}` : ""}
            </div>
          </>
        )}
      </td>
      <td>{shortFund(p.fund)}</td>
      <td className="num">{fmtMoney(purchaseTotal(p))}</td>
      <td>
        <StatusPill card={card} />
      </td>
      <td>
        <StageCell card={card} />
      </td>
    </tr>
  );
}

export function PurchaseTable({ cards, redact, showOwner, empty }: { cards: PurchaseCard[]; redact?: (c: PurchaseCard) => boolean; showOwner?: boolean; empty: string }) {
  if (cards.length === 0) return <div className="panel empty">{empty}</div>;
  return (
    <div className="tablewrap">
      <table className="table">
        <thead>
          <tr>
            <th>Request</th>
            <th>Fund</th>
            <th className="num">Total</th>
            <th>Status</th>
            <th>Stage</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <PurchaseRow key={c.id} card={c} redact={redact?.(c)} showOwner={showOwner} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  const okText: Record<string, string> = {
    submitted: "Request submitted. You can follow it here and in My Requests.",
    resubmitted: "Changes saved and the request is back in review.",
    approve: "Approved.",
    return: "Sent back with your note.",
    saved: "Vendor saved.",
    merged: "Vendors merged.",
    reject: "Rejected.",
    pay: "Payment recorded.",
    books: "Marked as entered in QuickBooks.",
    resolve: "Recorded.",
    cancel: "Request cancelled.",
    commented: "Comment added. The people on this request can see it.",
  };
  if (error) return <div className="error" role="alert">{error}</div>;
  if (ok && okText[ok]) return <div className="flash" role="status">{okText[ok]}</div>;
  return null;
}
