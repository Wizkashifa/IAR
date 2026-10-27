import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Button, buttonClass } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { ToastOnLoad } from "@/components/toast";
import { cardStore } from "@/lib/cards";
import { nameResolver } from "@/lib/names";
import { requireViewer } from "@/lib/viewer";
import { shortFund } from "@/lib/purchases/accounts";
import { DESK_TABS, PAY_TYPE_LABEL, deskCards, deskDate, deskOptions, filterDesk, isDeskTab, isPayType, lineKey, openReturns, payTypeOf, type DeskFilter, type DeskTab } from "@/lib/purchases/finance-desk";
import { KIND_LABEL, purchaseTotal } from "@/lib/purchases/types";
import { daysWaiting, isPurchaseCard, type PurchaseCard } from "@/lib/purchases/workflow";
import { fmtMoney, fmtMonth } from "@/lib/format";
import { deskAction } from "./actions";
import { DeskBatch, type DeskRow } from "./DeskBatch";
import { DeskFilters } from "./DeskFilters";
import { RESULT_COOKIE, readResult } from "./result";
import styles from "./finance.module.css";
import { Chips } from "@/components/Chips";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finance desk" };

type Search = { tab?: string; fund?: string; month?: string; type?: string; r?: string };

const waited = (c: PurchaseCard) => {
  const d = daysWaiting(c);
  return d === 0 ? "since today" : `${d} day${d === 1 ? "" : "s"}`;
};

export default async function FinanceDeskPage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const viewer = await requireViewer();
  if (!viewer.roles.includes("finance")) notFound();
  const tab: DeskTab = isDeskTab(q.tab) ? q.tab : "pay";
  const filter: DeskFilter = { fund: q.fund || undefined, month: /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month : undefined, type: isPayType(q.type) ? q.type : undefined };

  const open = (await (await cardStore()).listOpenPurchases()).filter(isPurchaseCard);
  const onTab = deskCards(open, tab);
  const shown = filterDesk(onTab, filter);
  const options = deskOptions(onTab);
  const names = await nameResolver(shown.map((c) => c.ownerEmail));
  const result = readResult((await cookies()).get(RESULT_COOKIE)?.value, q.r);

  const keep = (over: Partial<Search>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab, fund: filter.fund, month: filter.month, type: filter.type, ...over })) if (v) p.set(k, v);
    return `?${p}`;
  };
  const back = `/purchases/finance${keep({})}`;
  const csvHref = `/purchases/finance/csv${keep({})}`;

  const from = (c: PurchaseCard) => (c.purchase.restricted ? "Social & Welfare" : names(c.ownerEmail));
  const payee = (c: PurchaseCard) => (c.purchase.kind === "card" ? `Card ···${c.purchase.card?.last4 ?? ""}` : c.purchase.payee ?? "");
  const rows: DeskRow[] =
    tab === "returns"
      ? openReturns(shown).map(({ card, line }) => ({
          key: lineKey(card.id, line.id),
          id: card.id,
          title: card.title,
          href: `/purchases/${card.id}`,
          sub: [shortFund(card.purchase.fund), line.flag === "refund" ? `Refund from ${line.merchant ?? "the merchant"}` : `Repayment${line.repayBy ? ` from ${line.repayBy}` : ""}`, line.date ?? ""].filter(Boolean).join(" · "),
          status: line.flag === "refund" ? "Refund owed" : "Repayment owed",
          amount: line.amount,
          amountText: fmtMoney(line.amount),
          version: card.updatedAt,
        }))
      : shown.map((c) => ({
          key: c.id,
          id: c.id,
          title: c.title,
          href: `/purchases/${c.id}`,
          sub: [shortFund(c.purchase.fund), KIND_LABEL[c.purchase.kind], payee(c), `from ${from(c)}`].filter(Boolean).join(" · "),
          status: tab === "pay" ? `${PAY_TYPE_LABEL[payTypeOf(c)]} · waiting ${waited(c)}` : `Paid ${deskDate(c)}${c.purchase.payment ? ` · ${c.purchase.payment.method} ${c.purchase.payment.reference}` : ""}`,
          amount: purchaseTotal(c.purchase),
          amountText: fmtMoney(purchaseTotal(c.purchase)),
          version: c.updatedAt,
          method: payTypeOf(c) === "ach" ? "ACH" : "Check",
        }));
  const tabLabel = DESK_TABS.find((t) => t.id === tab)!.label;
  const filtered = Boolean(filter.fund || filter.month || filter.type);

  return (
    <>
      <ModuleHead
        title="Finance desk"
        lead="Pay approved requests, enter them in QuickBooks and record refunds, several at a time."
        actions={
          <>
            <Button href="/purchases">All payment requests</Button>
            {/* A plain link: the CSV is a download, not a page. */}
            <a href={csvHref} download className={buttonClass({ variant: "primary" })}>
              <Icon name="down" />
              Download CSV for QuickBooks
            </a>
          </>
        }
      />
      <div className={`stack ${styles.body}`}>
        <ToastOnLoad message={result?.summary} tone={result?.tone} />
        {result && result.failed.length > 0 && (
          <Note tone="warn">
            <p className={styles.noteHead}>{result.summary}</p>
            <ul className={styles.failed}>
              {result.failed.map((f) => (
                <li key={f.id}>
                  <Link href={`/purchases/${f.id}`}>{f.id}</Link>: {f.message}
                </li>
              ))}
            </ul>
          </Note>
        )}

        <Chips
          label="Finance desk lists"
          chips={DESK_TABS.map((t) => ({
            label: t.label,
            href: `/purchases/finance${keep({ tab: t.id, fund: undefined, month: undefined, type: undefined })}`,
            on: t.id === tab,
            count: t.id === "returns" ? openReturns(deskCards(open, "returns")).length : deskCards(open, t.id).length,
          }))}
        />

        <div className={styles.filterRow}>
          <DeskFilters
            tab={tab}
            fund={filter.fund ?? ""}
            month={filter.month ?? ""}
            type={filter.type ?? ""}
            funds={options.funds.map((f) => ({ value: f, label: shortFund(f) }))}
            months={options.months.map((m) => ({ value: m, label: fmtMonth(m) }))}
          />
          {filtered && (
            <Link href={`/purchases/finance?tab=${tab}`} className={styles.clear}>
              Clear filters
            </Link>
          )}
        </div>

        <DeskBatch key={back} tab={tab} rows={rows} back={back} action={deskAction} title={filtered ? `${tabLabel} · filtered` : tabLabel} />
        <p className="hint">The CSV has one row per line item for what&apos;s shown here: date, request, payee, fund, sub-account, memo and amount.</p>
      </div>
    </>
  );
}
