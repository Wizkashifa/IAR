import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel, PanelNote } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { cardStore, type Vendor } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { shortFund } from "@/lib/purchases/accounts";
import { visibleVendors, w9IsOld } from "@/lib/purchases/vendors";
import { FlashNote } from "@/components/FlashNote";
import { OK_TEXT, fmtDate } from "../ui";
import { mergeVendor, updateVendor } from "./actions";
import styles from "../purchases.module.css";
import { DataTable, cell } from "@/components/DataTable";
import { Disclosure } from "@/components/Disclosure";
import { SearchForm } from "@/components/SearchForm";
import { Crumb } from "@/components/Crumb";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved vendors" };

/**
 * Saved vendors, shared by every committee. Social & Welfare payees are a
 * separate section only S&W and finance see. No tax ID numbers anywhere; the
 * W-9 file link is for finance only.
 */
export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; error?: string }> }) {
  const { q = "", ok, error } = await searchParams;
  const viewer = await requireViewer();
  const finance = viewer.actingRoles.includes("finance");
  const { shared, restricted } = visibleVendors(await (await cardStore()).listVendors(), viewer.actingRoles);
  const needle = q.trim().toLowerCase();
  const match = (v: Vendor) => !needle || v.name.toLowerCase().includes(needle) || (v.address ?? "").toLowerCase().includes(needle);

  return (
    <>
      <Crumb trail={[{ href: "/purchases", label: "Payments" }]} here="Saved vendors" />
      <ModuleHead accent="pay"
        title="Saved vendors"
        lead="Every committee shares this list. Once a vendor is paid, the next request to them fills in their address and W-9 status. A W-9 is needed only for labor, and only once."
        actions={
          <Button href="/purchases/new" variant="primary" icon="plus">
            New payment request
          </Button>
        }
      />
      <div className={`stack ${styles.body}`}>
        <FlashNote ok={ok} error={error} messages={OK_TEXT} />
        <SearchForm action="/purchases/vendors" label="Search vendors" value={q} placeholder="Search by name or address" clear />

        <Panel title="Vendors" right={`${shared.filter(match).length}`} flush>
          <VendorTable list={shared.filter(match)} finance={finance} />
        </Panel>

        {restricted.length > 0 && (
          <Panel title="Social & Welfare payees" right={<Pill tone="bad">Restricted</Pill>} flush>
            <PanelNote>Only Social &amp; Welfare, the finance office and executives see these. They&apos;re never offered on other committees&apos; requests, so nobody else can find out who received help.</PanelNote>
            <VendorTable list={restricted.filter(match)} finance={finance} />
          </Panel>
        )}

        {finance && (shared.length > 1 || restricted.length > 1) && (
          <Panel title="Merge duplicates">
            <form action={mergeVendor} className="stack">
              <p className="hint">Same vendor typed two ways? Keep one record; its committees, payment count and W-9 are combined.</p>
              <div className="grid">
                <Field label="Keep">
                  <VendorSelect name="keep" shared={shared} restricted={restricted} />
                </Field>
                <Field label="Merge into it and remove">
                  <VendorSelect name="drop" shared={shared} restricted={restricted} />
                </Field>
              </div>
              <div>
                <Button type="submit">Merge</Button>
              </div>
            </form>
          </Panel>
        )}
        {finance && <Note>The finance office can fix a vendor&apos;s name, address or contact with Edit, and merge two records for the same vendor.</Note>}
      </div>
    </>
  );
}

function VendorSelect({ name, shared, restricted }: { name: string; shared: Vendor[]; restricted: Vendor[] }) {
  return (
    <select name={name} required defaultValue="">
      <option value="">Choose…</option>
      {shared.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
      {restricted.length > 0 && (
        <optgroup label="Social & Welfare">
          {restricted.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

function VendorTable({ list, finance }: { list: Vendor[]; finance: boolean }) {
  if (list.length === 0) return <EmptyState>No saved vendors match.</EmptyState>;
  return (
    <DataTable>
      <thead>
        <tr>
          <th>Vendor</th>
          <th>Used by</th>
          <th>W-9</th>
          <th>Last paid</th>
          <th className={cell.num}>Times paid</th>
        </tr>
      </thead>
      <tbody>
        {list.map((v) => (
          <tr key={v.id}>
            <td data-label="Vendor">
              <strong>{v.name}</strong>
              {v.address && <span className={`${cell.sub} ${styles.said}`}>{v.address}</span>}
              {finance && v.contact && <span className={cell.sub}>{v.contact}</span>}
              {finance && (
                <Disclosure summary="Edit" button="quiet">
                  <form action={updateVendor} className="stack">
                    <input type="hidden" name="id" value={v.id} />
                    <Field label="Name" required>
                      <input name="name" defaultValue={v.name} maxLength={120} required />
                    </Field>
                    <Field label="Mailing address">
                      <textarea name="address" defaultValue={v.address ?? ""} rows={2} maxLength={300} />
                    </Field>
                    <Field label="Email or phone">
                      <input name="contact" defaultValue={v.contact ?? ""} maxLength={120} />
                    </Field>
                    <div>
                      <Button type="submit" size="small">
                        Save
                      </Button>
                    </div>
                  </form>
                </Disclosure>
              )}
            </td>
            <td data-label="Used by" className="hint">
              {(v.funds ?? []).map(shortFund).join(", ") || "—"}
            </td>
            <td data-label="W-9">
              {v.w9OnFile ? (
                <Pill tone={w9IsOld(v) ? "warn" : "ok"}>
                  {w9IsOld(v) ? "On file, over 3 years old" : "On file"}
                  {v.w9Date ? ` · ${fmtDate(v.w9Date)}` : ""}
                </Pill>
              ) : (
                <Pill>None on file</Pill>
              )}
              {finance && v.w9FileId && (
                <span className={cell.sub}>
                  <a href={`https://drive.google.com/file/d/${v.w9FileId}/view`} target="_blank" rel="noreferrer">
                    Open W-9
                  </a>
                </span>
              )}
            </td>
            <td data-label="Last paid" className={`hint ${cell.nowrap}`}>
              {v.lastPaidAt ? fmtDate(v.lastPaidAt) : "—"}
            </td>
            <td data-label="Times paid" className={cell.num}>
              {v.timesPaid ?? 0}
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
