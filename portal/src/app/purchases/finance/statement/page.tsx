import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Crumb } from "@/components/Crumb";
import { DataTable, cell } from "@/components/DataTable";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { isDevAuth } from "@/lib/dev";
import { fmtDate, fmtMoney, fmtMonth } from "@/lib/format";
import { nameResolver } from "@/lib/names";
import { statementStore } from "@/lib/purchases/statements";
import { requireViewer } from "@/lib/viewer";
import { statementAction } from "./actions";
import StatementForm from "./StatementForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Card statement" };

export default async function StatementPage() {
  const viewer = await requireViewer();
  if (!viewer.roles.includes("finance")) notFound();
  const recent = await (await statementStore()).list(6);
  const names = await nameResolver(recent.map((s) => s.importedBy));
  return (
    <div className="stack">
      <Crumb trail={[{ href: "/purchases", label: "Payments" }, { href: "/purchases/finance", label: "Finance desk" }]} here="Card statement" />
      <ModuleHead
        title="Card statement"
        lead="Upload IAR's credit card statement once a month. Each cardholder's charges are filled in for them, so they only add the sub-account, why it was bought and the receipts."
      />
      {viewer.actingRoles.includes("finance") ? (
        <StatementForm action={statementAction} sampleHref={isDevAuth() ? "/purchases/finance/statement/sample" : undefined} />
      ) : (
        <Note>Only the finance office uploads card statements. You can see the ones already in.</Note>
      )}
      {recent.length > 0 && (
        <Panel title="Statements in" flush>
          <DataTable caption="Statements already uploaded">
            <thead>
              <tr>
                <th>Month</th>
                <th className={cell.num}>Cards</th>
                <th className={cell.num}>Total</th>
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
