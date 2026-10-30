import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Button, buttonClass } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ItemList, rowsFor, sectionsOf } from "@/components/ItemList";
import { Rows } from "@/components/ItemRow";
import { HelpBox } from "@/components/HelpBox";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel, PanelFoot, PanelNote } from "@/components/Panel";
import { Icon } from "@/components/Icon";
import { Note } from "@/components/Note";
import { Pill } from "@/components/Pill";
import { ToastOnLoad } from "@/components/toast";
import { cardStore } from "@/lib/cards";
import { emailsIn, type RowData } from "@/lib/card-row";
import { nameResolver, type NameResolver } from "@/lib/names";
import { groupForViewer, type NeedsViewer } from "@/lib/needs-you";
import { requireViewer } from "@/lib/viewer";
import { actorFor } from "@/lib/people";
import { shortFund } from "@/lib/purchases/accounts";
import { PAY_TYPE_LABEL, cardChecklist, deskCards, deskDate, deskOptions, filterDesk, lineKey, mayViewDesk, mayWorkDesk, openReturns, payTypeOf, type DeskTab } from "@/lib/purchases/finance-desk";
import { statementStore, type ImportedStatement } from "@/lib/purchases/statements";
import { KIND_LABEL, STAGE_LABEL, openExpectedReturns, purchaseTotal, type PurchaseStage } from "@/lib/purchases/types";
import { ESCALATE_DAYS, actionableBy, canViewDetail, daysWaiting, isPurchaseCard, type PurchaseCard } from "@/lib/purchases/workflow";
import { FlashNote } from "@/components/FlashNote";
import { OK_TEXT, PurchaseRow } from "./ui";
import { fmtMoney, fmtMonth } from "@/lib/format";
import { deskAction } from "./desk-actions";
import { DeskBatch, type DeskRow } from "./DeskBatch";
import { RESULT_COOKIE, readResult } from "./desk-result";
import { PaymentFilters } from "./PaymentFilters";
import styles from "./purchases.module.css";
import { DataTable } from "@/components/DataTable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payments" };

const FILTERS: { id: string; label: string; test: (c: PurchaseCard) => boolean }[] = [
  { id: "all", label: "All open", test: (c) => c.status !== "closed" },
  ...(["chair", "finance", "executive", "payment", "books"] as PurchaseStage[]).map((stage) => ({
    id: stage,
    label: STAGE_LABEL[stage],
    test: (c: PurchaseCard) => c.purchase.stage === stage && (c.status === "in_review" || c.status === "approved" || c.status === "paid"),
  })),
  { id: "returned", label: "Sent back", test: (c) => c.status === "changes_requested" },
  { id: "late", label: `Waiting ${ESCALATE_DAYS}+ days`, test: (c) => c.status !== "changes_requested" && c.status !== "closed" && daysWaiting(c) >= ESCALATE_DAYS },
  { id: "returns", label: "Refunds & repayments due", test: (c) => openExpectedReturns(c.purchase).length > 0 },
];

/** Finance's lists: the views finance works several at a time, and which desk list each one is. */
const DESK_VIEW: Record<string, DeskTab> = { payment: "pay", books: "books", returns: "returns" };

/** List rows for purchases; each pill says who has it, as in every other list (lib/status-text.ts rowStatusText). */
function rows(cards: PurchaseCard[], viewer: NeedsViewer, names: NameResolver): RowData[] {
  return rowsFor(cards, viewer, { names });
}

type Search = { view?: string; ok?: string; error?: string; fund?: string; month?: string; r?: string };

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { view = "all", ok, error, r } = await searchParams;
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const store = await cardStore();
  // Finance pays, books and records several at a time, and checks card receipts; executives see these too.
  const desk = mayViewDesk(viewer.roles);
  const works = mayWorkDesk(viewer.actingRoles);
  const [mine, open, latest, cardReceipts] = await Promise.all([
    store.listByOwner(viewer.email),
    store.listOpenPurchases(),
    desk ? statementStore().then((s) => s.list(1)) : Promise.resolve([]),
    desk ? store.listCardReceipts() : Promise.resolve([]),
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
    .filter((c) => actor.oversees?.includes(c.purchase.fund) && !inQueue.has(c.id) && !c.purchase.restricted && c.status !== "closed" && c.ownerEmail.toLowerCase() !== viewer.email.toLowerCase())
    .sort((a, b) => daysWaiting(b) - daysWaiting(a));

  const names = await nameResolver(emailsIn([...myPurchases, ...queue, ...committeeOpen, ...(overseer ? filtered : [])]));
  const mineGrouped = groupForViewer(myPurchases, actor);
  const mineRows = { needsYou: rows(mineGrouped.needsYou, actor, names), waiting: rows(mineGrouped.waiting, actor, names), done: rows(mineGrouped.done, actor, names) };
  // Finance's lists (To pay, Enter in QuickBooks, Refunds) count what they show.
  const count = (id: string, test: (c: PurchaseCard) => boolean) => {
    const t = desk ? DESK_VIEW[id] : undefined;
    if (!t) return openPurchases.filter(test).length;
    return t === "returns" ? openReturns(deskCards(openPurchases, t)).length : deskCards(openPurchases, t).length;
  };
  const views = FILTERS.map((f) => ({ value: f.id, label: `${f.label} (${count(f.id, f.test)})` }));
  const deskTab = desk ? DESK_VIEW[filter.id] : undefined;
  const deskList = deskTab ? await financeList(openPurchases, deskTab, filter.id, await searchParams) : null;
  const result = deskTab ? readResult((await cookies()).get(RESULT_COOKIE)?.value, r) : null;

  return (
    <>
      <ModuleHead accent="pay"
        title="Payments"
        lead="Pay a vendor, get reimbursed, or send in IAR credit card receipts, split across sub-accounts."
        actions={
          <>
            {desk && (
              <Button href="/purchases/statement" variant="quiet">
                {works ? "Upload card statement" : "Card statements"}
              </Button>
            )}
            <Button href="/purchases/vendors" variant="quiet">
              Saved vendors
            </Button>
            <Button href="/purchases/new" variant="primary" icon="plus">
              New payment request
            </Button>
          </>
        }
      />
      <HelpBox module="purchases" />
      <div className={`stack ${styles.body}`}>
        <FlashNote ok={ok} error={error} messages={OK_TEXT} />
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

        {queue.length > 0 && (
          <PurchaseList
            title={finance ? "Waiting on the finance office" : "Waiting for your approval"}
            right={<Pill tone="warn">{queue.length}</Pill>}
            cards={queue}
            rows={rows(queue, actor, names)}
            redact={redact}
          />
        )}

        {(myPurchases.length > 0 || !overseer) && <ItemList
          title="Your requests"
          sections={sectionsOf(mineRows)}
          empty="You haven't sent a payment request yet."
          emptyAction={
            <Button href="/purchases/new" size="small">
              New payment request
            </Button>
          }
        />}

        {!overseer && actor.oversees && actor.oversees.length > 0 && (
          <PurchaseList
            title="Your committees"
            right={actor.oversees.map(shortFund).join(", ")}
            cards={committeeOpen}
            rows={rows(committeeOpen, actor, names)}
            redact={redact}
            empty="No other open requests from your committees."
            note="Open requests for the committees you chair, vice-chair or direct. Vice chairs and directors can also approve at the chair step."
          />
        )}

        {overseer && (
          <section className="stack" aria-label="All requests">
            <div className={styles.filterRow}>
              <PaymentFilters view={filter.id} views={views} fund={deskList?.fund ?? ""} month={deskList?.month ?? ""} funds={deskList?.funds} months={deskList?.months} />
              {deskList?.filtered && (
                <Button href={`/purchases?view=${filter.id}`} variant="quiet">
                  Clear filters
                </Button>
              )}
              {deskList && (
                // A plain link: the CSV is a download, not a page.
                <a href={deskList.csvHref} download className={buttonClass({ variant: "quiet", className: styles.csv })}>
                  <Icon name="down" />
                  Download CSV for QuickBooks
                </a>
              )}
            </div>
            {deskTab && deskList ? (
              <>
                <DeskBatch
                  key={deskList.back}
                  tab={deskTab}
                  rows={deskList.rows}
                  back={deskList.back}
                  action={deskAction}
                  title={deskList.filtered ? `${filter.label} · filtered` : filter.label}
                  readOnly={!works}
                  foot="The CSV has one row per line item for what's shown here: date, request, payee, fund, sub-account, memo and amount."
                />
              </>
            ) : (
              <PurchaseList
                title={filter.id === "all" ? "All open requests" : filter.label}
                right={
                  filter.id === "returns" && filtered.length
                    ? `Outstanding ${fmtMoney(filtered.flatMap((c) => openExpectedReturns(c.purchase)).reduce((s, l) => s + l.amount, 0))}`
                    : `${filtered.length}`
                }
                cards={filtered}
                rows={rows(filtered, actor, names)}
                redact={redact}
                empty="Nothing here."
              />
            )}
          </section>
        )}

        {desk && <CardChecklist statement={latest[0]} receipts={cardReceipts.filter(isPurchaseCard)} />}
      </div>
    </>
  );
}

const waited = (c: PurchaseCard) => {
  const d = daysWaiting(c);
  return d === 0 ? "since today" : `${d} day${d === 1 ? "" : "s"}`;
};

/**
 * One of finance's lists (To pay, Enter in QuickBooks, Refunds owed), filtered
 * by fund and month, as rows finance can tick and work several at a time.
 */
async function financeList(open: PurchaseCard[], tab: DeskTab, view: string, q: Search) {
  const fund = q.fund || undefined;
  const month = /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month : undefined;
  const onTab = deskCards(open, tab);
  const shown = filterDesk(onTab, { fund, month });
  const options = deskOptions(onTab);
  const names = await nameResolver(shown.map((c) => c.ownerEmail));
  const query = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    return `?${p}`;
  };
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
  return {
    rows,
    fund,
    month,
    filtered: Boolean(fund || month),
    funds: options.funds.map((f) => ({ value: f, label: shortFund(f) })),
    months: options.months.map((m) => ({ value: m, label: fmtMonth(m) })),
    back: `/purchases${query({ view, fund, month })}`,
    csvHref: `/purchases/csv${query({ tab, fund, month })}`,
  };
}

/** Requests with how long each has waited at its step, most overdue first. */
function PurchaseList({ title, right, cards, rows, redact, empty, note }: { title: string; right?: React.ReactNode; cards: PurchaseCard[]; rows: RowData[]; redact: (c: PurchaseCard) => boolean; empty?: string; note?: string }) {
  return (
    <Panel title={title} right={right} flush>
      {note && <PanelNote>{note}</PanelNote>}
      {cards.length === 0 ? (
        <EmptyState>{empty ?? "Nothing here."}</EmptyState>
      ) : (
        <Rows>
          {cards.map((c, i) => (
            <PurchaseRow key={c.id} card={c} row={rows[i]} redacted={redact(c)} days />
          ))}
        </Rows>
      )}
    </Panel>
  );
}

/** Which cards on the latest uploaded statement have their receipts in (lib/purchases/finance-desk.ts cardChecklist). */
function CardChecklist({ statement, receipts }: { statement?: ImportedStatement; receipts: PurchaseCard[] }) {
  const foot = (
    <PanelFoot>
      <Link href="/purchases/statement">See the card statements</Link>
    </PanelFoot>
  );
  if (!statement) {
    return (
      <Panel title="Card receipts" flush>
        <PanelNote>No card statement is in yet. The finance office uploads it each month.</PanelNote>
        {foot}
      </Panel>
    );
  }
  const { month, rows } = cardChecklist(statement, receipts);
  return (
    <Panel title={`Card receipts for the ${fmtMonth(month)} statement`} right={`${rows.length} card${rows.length === 1 ? "" : "s"}`} flush>
      <DataTable>
        <thead>
          <tr>
            <th>Card</th>
            <th>Cardholder</th>
            <th>Receipts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.last4}>
              <td data-label="Card">
                <Link href={`/purchases/cards/${c.last4}`}>···{c.last4}</Link>
              </td>
              <td data-label="Cardholder">{c.holderName}</td>
              <td data-label="Receipts">
                {c.request ? (
                  <>
                    <Link href={`/purchases/${c.request.id}`}>{c.request.id}</Link> <Pill tone="ok">Sent</Pill>
                  </>
                ) : (
                  <Pill tone="warn">Not sent yet</Pill>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {foot}
    </Panel>
  );
}
