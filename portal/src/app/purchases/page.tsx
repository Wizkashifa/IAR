import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ItemList, rowsFor, sectionsOf } from "@/components/ItemList";
import { HelpBox } from "@/components/HelpBox";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel, PanelFoot, PanelNote } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { cardStore } from "@/lib/cards";
import { emailsIn, type RowData } from "@/lib/card-row";
import { nameResolver, type NameResolver } from "@/lib/names";
import { groupForViewer, type NeedsViewer } from "@/lib/needs-you";
import { requireViewer } from "@/lib/viewer";
import { actorFor } from "@/lib/people";
import { shortFund } from "@/lib/purchases/accounts";
import { cardChecklist, mayViewDesk } from "@/lib/purchases/finance-desk";
import { statementStore, type ImportedStatement } from "@/lib/purchases/statements";
import { STAGE_LABEL, openExpectedReturns, type PurchaseStage } from "@/lib/purchases/types";
import { ESCALATE_DAYS, actionableBy, canViewDetail, daysWaiting, isPurchaseCard, type PurchaseCard } from "@/lib/purchases/workflow";
import { FlashNote } from "@/components/FlashNote";
import { OK_TEXT, PurchaseRow, fmtMoney, fmtMonth } from "./ui";
import styles from "./purchases.module.css";
import { Chips } from "@/components/Chips";
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

/** List rows for purchases; each pill says who has it, as in every other list (lib/status-text.ts rowStatusText). */
function rows(cards: PurchaseCard[], viewer: NeedsViewer, names: NameResolver): RowData[] {
  return rowsFor(cards, viewer, { names });
}

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ view?: string; ok?: string; error?: string }> }) {
  const { view = "all", ok, error } = await searchParams;
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const store = await cardStore();
  // Finance works the desk and card receipts; executives see them too.
  const desk = mayViewDesk(viewer.roles);
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
  const chips = FILTERS.map((f) => ({ label: f.label, href: `/purchases?view=${f.id}`, on: f.id === filter.id, count: openPurchases.filter(f.test).length }));

  return (
    <>
      <ModuleHead accent="pay"
        title="Payments"
        lead="Pay a vendor, get reimbursed, or send in IAR credit card receipts, split across sub-accounts."
        actions={
          <>
            {desk && <Button href="/purchases/finance">Finance desk</Button>}
            <Button href="/purchases/vendors">Saved vendors</Button>
            <Button href="/purchases/new" variant="primary" icon="plus">
              New payment request
            </Button>
          </>
        }
      />
      <HelpBox module="purchases" />
      <div className={`stack ${styles.body}`}>
        <FlashNote ok={ok} error={error} messages={OK_TEXT} />

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
            <Chips label="Show" chips={chips} />
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
          </section>
        )}

        {desk && <CardChecklist statement={latest[0]} receipts={cardReceipts.filter(isPurchaseCard)} />}
      </div>
    </>
  );
}

/** Requests with how long each has waited at its step, most overdue first. */
function PurchaseList({ title, right, cards, rows, redact, empty, note }: { title: string; right?: React.ReactNode; cards: PurchaseCard[]; rows: RowData[]; redact: (c: PurchaseCard) => boolean; empty?: string; note?: string }) {
  return (
    <Panel title={title} right={right} flush>
      {note && <PanelNote>{note}</PanelNote>}
      {cards.length === 0 ? (
        <EmptyState>{empty ?? "Nothing here."}</EmptyState>
      ) : (
        <ul className={styles.list}>
          {cards.map((c, i) => (
            <PurchaseRow key={c.id} card={c} row={rows[i]} redacted={redact(c)} days />
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Which cards on the latest uploaded statement have their receipts in (lib/purchases/finance-desk.ts cardChecklist). */
function CardChecklist({ statement, receipts }: { statement?: ImportedStatement; receipts: PurchaseCard[] }) {
  const foot = (
    <PanelFoot>
      <Link href="/purchases/finance/statement">See the card statements</Link>
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
