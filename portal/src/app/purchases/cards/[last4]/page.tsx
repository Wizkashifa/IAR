import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Crumb } from "@/components/Crumb";
import { DataTable, cell } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { KeyValue } from "@/components/KeyValue";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel, PanelNote } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { cardStore } from "@/lib/cards";
import { fmtDate } from "@/lib/format";
import { actorFor } from "@/lib/people";
import { accountLabel, findAccount, shortFund } from "@/lib/purchases/accounts";
import { cardHistory, cardTotals } from "@/lib/purchases/card-history";
import { mayViewDesk } from "@/lib/purchases/finance-desk";
import { purchaseContext } from "@/lib/purchases/settings";
import { statementStore } from "@/lib/purchases/statements";
import { canViewDetail, isPurchaseCard } from "@/lib/purchases/workflow";
import { same } from "@/lib/text";
import { requireViewer } from "@/lib/viewer";
import { fmtMoney, fmtMonth, purchaseStatus } from "../../ui";

export const dynamic = "force-dynamic";

/** How many statements back a card's page goes: two years. */
const MONTHS = 24;

export async function generateMetadata({ params }: { params: Promise<{ last4: string }> }): Promise<Metadata> {
  return { title: `Card ···${(await params).last4}` };
}

/**
 * One IAR card: every charge on the statements finance has uploaded, with the
 * sub-account, why it was bought and whether its receipt is in. Finance and
 * executives see every card; a cardholder sees their own.
 */
export default async function CardPage({ params }: { params: Promise<{ last4: string }> }) {
  const { last4 } = await params;
  if (!/^\d{4}$/.test(last4)) notFound();
  const viewer = await requireViewer();
  const card = (await purchaseContext()).cards.find((c) => c.last4 === last4);
  if (!mayViewDesk(viewer.roles) && !(card && same(card.holderEmail, viewer.email))) notFound();

  const statements = await (await statementStore()).list(MONTHS);
  // Receipts are sent only after their statement is in, so the oldest one's upload is far enough back.
  const oldest = statements.at(-1)?.importedAt;
  const requests = oldest ? (await (await cardStore()).listPurchasesSince(oldest)).filter(isPurchaseCard) : [];
  const months = cardHistory(statements, requests, last4);
  if (!card && months.length === 0) notFound();
  const totals = cardTotals(months);
  const actor = await actorFor(viewer);
  const holder = card?.holderName ?? months[0]?.holderName ?? "";

  return (
    <div className="stack">
      <Crumb trail={[{ href: "/purchases", label: "Payments" }]} here={`Card ···${last4}`} />
      <ModuleHead accent="pay" title={`Card ···${last4}`} lead={`${holder}. Every charge on IAR's card statements, with the sub-account, why it was bought and whether its receipt is in.`} />
      <Panel>
        <KeyValue
          items={[
            { label: "Cardholder", value: holder },
            { label: "Statements", value: months.length ? `${months.length} (${fmtMonth(months.at(-1)!.month)} to ${fmtMonth(months[0].month)})` : "None in yet" },
            { label: "Charges", value: `${totals.charges}, ${fmtMoney(totals.total)}` },
            { label: "Receipts missing", value: totals.missing ? <Pill tone="warn">{totals.missing}</Pill> : "None" },
            { label: "Card", value: card ? undefined : "No longer in Portal Settings" },
          ]}
        />
      </Panel>
      {months.length === 0 && (
        <Panel>
          <EmptyState icon="receipt">No statements with charges on this card yet. They show here once the finance office uploads the month&apos;s statement.</EmptyState>
        </Panel>
      )}
      {months.map((m) => {
        const r = m.request;
        const open = r ? canViewDetail(r, { ...actor, seeAll: false }) : false;
        return (
          <Panel key={m.month} title={fmtMonth(m.month)} right={<strong>{fmtMoney(m.total)}</strong>} flush>
            <PanelNote>
              {r ? (
                <>
                  Receipts sent as <Link href={`/purchases/${r.id}`}>{r.id}</Link> · {purchaseStatus(r)}
                </>
              ) : m.charges.length ? (
                <>Receipts not sent yet.</>
              ) : (
                <>No charges this month.</>
              )}
            </PanelNote>
            {m.charges.length > 0 && (
              <DataTable compact caption={`Charges on card ···${last4}, ${fmtMonth(m.month)}`}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Charge</th>
                    <th className={cell.num}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {m.charges.map((c) => {
                    const l = open ? c.line : undefined;
                    const acct = l ? findAccount(l.accountId) : undefined;
                    return (
                      <tr key={c.ref}>
                        <td data-label="Date" className={`${cell.nowrap} ${cell.date}`}>
                          {fmtDate(`${c.date}T12:00:00Z`)}
                        </td>
                        <td data-label="Charge">
                          <strong>{c.merchant}</strong>
                          <span className={cell.sub}>{c.description}</span>
                          {acct && (
                            <span className={cell.sub}>
                              {accountLabel(acct)} ({shortFund(acct.fund)})
                            </span>
                          )}
                          {l?.note && <span className={cell.sub}>{l.note}</span>}
                          {c.amount < 0 ? (
                            <Pill tone="info">Credit</Pill>
                          ) : l ? (
                            <Pill tone={l.hasReceipt ? "ok" : "warn"}>{l.hasReceipt ? "Receipt in" : "No receipt"}</Pill>
                          ) : r && !open ? null : (
                            <Pill tone="warn">Not sent yet</Pill>
                          )}
                        </td>
                        <td data-label="Amount" className={cell.num}>
                          {fmtMoney(c.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
