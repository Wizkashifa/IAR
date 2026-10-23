import Link from "next/link";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { actorFor } from "@/lib/people";
import { shortFund } from "@/lib/purchases/accounts";
import { type CreditCard, purchaseContext } from "@/lib/purchases/settings";
import { STAGE_LABEL, openExpectedReturns, type PurchaseStage } from "@/lib/purchases/types";
import { ESCALATE_DAYS, actionableBy, canViewDetail, daysWaiting, isPurchaseCard, type PurchaseCard } from "@/lib/purchases/workflow";
import { Flash, PurchaseTable, fmtMoney, fmtMonth } from "./ui";

export const dynamic = "force-dynamic";

const FILTERS: { id: string; label: string; test: (c: PurchaseCard) => boolean }[] = [
  { id: "all", label: "All open", test: (c) => c.status !== "closed" },
  ...(["chair", "finance", "executive", "payment", "books"] as PurchaseStage[]).map((stage) => ({
    id: stage,
    label: STAGE_LABEL[stage],
    test: (c: PurchaseCard) => c.purchase.stage === stage && (c.status === "in_review" || c.status === "approved" || c.status === "paid"),
  })),
  { id: "returned", label: "Back with requester", test: (c) => c.status === "changes_requested" },
  { id: "late", label: `Waiting ${ESCALATE_DAYS}+ days`, test: (c) => c.status !== "changes_requested" && c.status !== "closed" && daysWaiting(c) >= ESCALATE_DAYS },
  { id: "returns", label: "Refunds & repayments due", test: (c) => openExpectedReturns(c.purchase).length > 0 },
];

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ view?: string; ok?: string; error?: string }> }) {
  const { view = "all", ok, error } = await searchParams;
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const store = await cardStore();
  const since = new Date(Date.now() - 75 * 864e5).toISOString();
  const [mine, open, recent] = await Promise.all([
    store.listByOwner(viewer.email),
    store.listOpenPurchases(),
    viewer.roles.includes("finance") ? store.listPurchasesSince(since) : Promise.resolve([]),
  ]);
  const myPurchases = mine.filter(isPurchaseCard);
  const openPurchases = open.filter(isPurchaseCard);
  const queue = actionableBy(openPurchases, actor).sort((a, b) => daysWaiting(b) - daysWaiting(a));

  // The office-wide view: finance, office and executive.
  const overseer = viewer.roles.some((r) => r === "finance" || r === "office" || r === "executive");
  const filter = FILTERS.find((f) => f.id === view) ?? FILTERS[0];
  const filtered = openPurchases.filter(filter.test).sort((a, b) => daysWaiting(b) - daysWaiting(a));
  const redact = (c: PurchaseCard) => !canViewDetail(c, { ...actor, seeAll: viewer.roles.includes("admins") });
  const finance = viewer.roles.includes("finance");
  const inQueue = new Set(queue.map((c) => c.id));
  const committeeOpen = openPurchases
    .filter((c) => actor.oversees?.includes(c.purchase.fund) && !inQueue.has(c.id) && !c.purchase.restricted && c.status !== "closed")
    .sort((a, b) => daysWaiting(b) - daysWaiting(a));

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Purchase Requests</h1>
          <p className="lead">Pay a vendor, get reimbursed, or submit IAR credit card receipts.</p>
        </div>
        <div className="row">
          <Link href="/purchases/vendors" className="button secondary">
            Saved vendors
          </Link>
          <Link href="/purchases/new" className="button">
            New request
          </Link>
        </div>
      </div>
      <Flash ok={ok} error={error} />

      {queue.length > 0 && (
        <>
          <h2>Waiting on you ({queue.length})</h2>
          <PurchaseTable cards={queue} redact={redact} showOwner empty="" />
        </>
      )}

      {!overseer && committeeOpen.length > 0 && (
        <>
          <h2>Your committees ({committeeOpen.length} open)</h2>
          <p className="note">Open requests for {actor.oversees?.map(shortFund).join(", ")}. You can see them because you chair, vice-chair or direct these committees. Co-chairs and directors can also approve them at the chair step.</p>
          <PurchaseTable cards={committeeOpen} redact={redact} showOwner empty="" />
        </>
      )}

      {overseer && (
        <>
          <h2>All requests</h2>
          <div className="filters" role="tablist">
            {FILTERS.map((f) => {
              const n = openPurchases.filter(f.test).length;
              return (
                <Link key={f.id} href={`/purchases?view=${f.id}`} className={`filter${f.id === filter.id ? " on" : ""}`} aria-current={f.id === filter.id}>
                  {f.label} <span>{n}</span>
                </Link>
              );
            })}
          </div>
          <PurchaseTable cards={filtered} redact={redact} showOwner empty="Nothing here." />
          {filter.id === "returns" && filtered.length > 0 && (
            <p className="sub">
              Outstanding:{" "}
              {fmtMoney(filtered.flatMap((c) => openExpectedReturns(c.purchase)).reduce((s, l) => s + l.amount, 0))}
            </p>
          )}
        </>
      )}

      {finance && <CardChecklist cards={recent.filter(isPurchaseCard)} list={(await purchaseContext()).cards} />}

      <h2>Your requests</h2>
      <PurchaseTable cards={myPurchases} empty="You haven't submitted a purchase request yet." />
    </>
  );
}

/** Which IAR cards have receipts in for last month. */
function CardChecklist({ cards, list }: { cards: PurchaseCard[]; list: CreditCard[] }) {
  if (list.length === 0) return null;
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const month = d.toISOString().slice(0, 7);
  return (
    <>
      <h2>Card receipts for {fmtMonth(month)}</h2>
      <div className="tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th>Card</th>
              <th>Cardholder</th>
              <th>Fund</th>
              <th>Receipts</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const sub = cards.find((x) => x.purchase.card?.last4 === c.last4 && x.purchase.card.statementMonth === month && x.status !== "cancelled");
              return (
                <tr key={c.last4}>
                  <td>···{c.last4}</td>
                  <td>{c.holderName}</td>
                  <td>{shortFund(c.fund)}</td>
                  <td>{sub ? <Link href={`/purchases/${sub.id}`}>{sub.id}</Link> : <span className="pill changes_requested">Not submitted</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
