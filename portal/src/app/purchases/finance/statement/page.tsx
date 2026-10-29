import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumb } from "@/components/Crumb";
import { DataTable, cell } from "@/components/DataTable";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel, PanelNote } from "@/components/Panel";
import { isDevAuth } from "@/lib/dev";
import { fmtDate, fmtMoney, fmtMonth } from "@/lib/format";
import { nameResolver } from "@/lib/names";
import { mayViewDesk, mayWorkDesk, statementReceipts } from "@/lib/purchases/finance-desk";
import { isPurchaseCard } from "@/lib/purchases/workflow";
import { cardStore } from "@/lib/cards";
import { statementStore } from "@/lib/purchases/statements";
import { requireViewer } from "@/lib/viewer";
import { statementAction } from "./actions";
import StatementForm from "./StatementForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Card statement" };

export default async function StatementPage() {
  const viewer = await requireViewer();
  if (!mayViewDesk(viewer.roles)) notFound();
  const recent = await (await statementStore()).list(6);
  // Receipts are sent only after their statement is in, so the oldest one's upload is far enough back.
  const oldest = recent.at(-1)?.importedAt;
  const sent = oldest ? (await (await cardStore()).listPurchasesSince(oldest)).filter(isPurchaseCard) : [];
  const names = await nameResolver(recent.map((s) => s.importedBy));
  const works = mayWorkDesk(viewer.actingRoles);
  return (
    <div className="stack">
      <Crumb trail={[{ href: "/purchases", label: "Payments" }, { href: "/purchases/finance", label: "Finance desk" }]} here="Card statement" />
      <ModuleHead
        title={works ? "Card statement" : "Card statements"}
        lead={
          works
            ? "Upload IAR's credit card statement once a month. Each cardholder's charges are filled in for them, so they only add the sub-account, why it was bought and the receipts."
            : "IAR's credit card statements, and the receipts each cardholder sent in for them."
        }
      />
      {works ? (
        <StatementForm action={statementAction} sampleHref={isDevAuth() ? "/purchases/finance/statement/sample" : undefined} />
      ) : (
        <Note>Only the finance office uploads card statements. You can see the ones already in.</Note>
      )}
      {recent.length > 0 && (
        <Panel title="Statements in" flush>
          <PanelNote>Each card&apos;s receipts open from here: the charges, why each was bought, and the receipt for each.</PanelNote>
          <DataTable caption="Statements already uploaded">
            <thead>
              <tr>
                <th>Month</th>
                <th className={cell.num}>Cards</th>
                <th className={cell.num}>Total</th>
                <th>Receipts sent</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.month}>
                  <td data-label="Month">{fmtMonth(s.month)}</td>
                  <td data-label="Cards" className={cell.num}>
                    {s.cards.length}
                  </td>
                  <td data-label="Total" className={cell.num}>
                    {fmtMoney(s.total)}
                  </td>
                  <td data-label="Receipts sent">
                    {(() => {
                      const got = statementReceipts(sent, s.month);
                      return (
                        <>
                          {got.length} of {s.cards.length}
                          {got.length > 0 && (
                            <span className={cell.sub}>
                              {got.map((c, i) => (
                                <span key={c.id}>
                                  {i > 0 && ", "}
                                  <Link href={`/purchases/cards/${c.purchase.card!.last4}`}>···{c.purchase.card!.last4}</Link>: <Link href={`/purchases/${c.id}`}>{c.id}</Link>
                                </span>
                              ))}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td data-label="Uploaded">
                    {fmtDate(s.importedAt)} by {names(s.importedBy)}
                    {s.driveFileId && (
                      <span className={cell.sub}>
                        <a href={`https://drive.google.com/file/d/${encodeURIComponent(s.driveFileId)}/view`} target="_blank" rel="noreferrer">
                          Open the PDF
                        </a>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      )}
    </div>
  );
}
