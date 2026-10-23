import Link from "next/link";
import { cardStore, type Vendor } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { shortFund } from "@/lib/purchases/accounts";
import { visibleVendors, w9IsOld } from "@/lib/purchases/vendors";
import { Flash, fmtDate } from "../ui";
import { mergeVendor, updateVendor } from "./actions";

export const dynamic = "force-dynamic";

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
      <p className="crumb">
        <Link href="/purchases">Purchase Requests</Link>
      </p>
      <div className="pagehead">
        <div>
          <h1>Saved vendors</h1>
          <p className="lead">Every committee shares this list. Once a vendor is paid, the next request to them fills in their address and W-9 status.</p>
        </div>
      </div>
      <Flash ok={ok} error={error} />
      <form className="row" action="/purchases/vendors">
        <input name="q" defaultValue={q} placeholder="Search by name or address" aria-label="Search vendors" />
        <button className="button secondary" type="submit">Search</button>
      </form>

      <VendorTable list={shared.filter(match)} finance={finance} />

      {restricted.length > 0 && (
        <>
          <h2>Social &amp; Welfare payees</h2>
          <p className="note">Only Social &amp; Welfare and the finance office see these. They are never offered on other committees&apos; requests.</p>
          <VendorTable list={restricted.filter(match)} finance={finance} />
        </>
      )}

      {finance && (shared.length > 1 || restricted.length > 1) && (
        <>
          <h2>Merge duplicates</h2>
          <p className="note">Same vendor typed two ways? Keep one record; its committees, payment count and W-9 are combined.</p>
          <form action={mergeVendor} className="row">
            <label className="field">
              <span>Keep</span>
              <VendorSelect name="keep" shared={shared} restricted={restricted} />
            </label>
            <label className="field">
              <span>Merge into it and remove</span>
              <VendorSelect name="drop" shared={shared} restricted={restricted} />
            </label>
            <button className="button secondary" type="submit">Merge</button>
          </form>
        </>
      )}
    </>
  );
}

function VendorSelect({ name, shared, restricted }: { name: string; shared: Vendor[]; restricted: Vendor[] }) {
  return (
    <select name={name} required defaultValue="">
      <option value="">Choose…</option>
      {shared.map((v) => (
        <option key={v.id} value={v.id}>{v.name}</option>
      ))}
      {restricted.length > 0 && (
        <optgroup label="Social & Welfare">
          {restricted.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

function VendorTable({ list, finance }: { list: Vendor[]; finance: boolean }) {
  if (list.length === 0) return <p className="note">No saved vendors match.</p>;
  return (
    <div className="tablewrap">
      <table className="table">
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Used by</th>
            <th>W-9</th>
            <th>Last paid</th>
            <th className="num">Times paid</th>
          </tr>
        </thead>
        <tbody>
          {list.map((v) => (
            <tr key={v.id}>
              <td>
                <strong>{v.name}</strong>
                {v.address && <div className="sub pre">{v.address}</div>}
                {finance && v.contact && <div className="sub">{v.contact}</div>}
                {finance && (
                  <details>
                    <summary className="linkbtn">Edit</summary>
                    <form action={updateVendor} className="stack">
                      <input type="hidden" name="id" value={v.id} />
                      <label className="field"><span>Name</span><input name="name" defaultValue={v.name} maxLength={120} required /></label>
                      <label className="field"><span>Mailing address</span><textarea name="address" defaultValue={v.address ?? ""} rows={2} maxLength={300} /></label>
                      <label className="field"><span>Email or phone</span><input name="contact" defaultValue={v.contact ?? ""} maxLength={120} /></label>
                      <button className="button secondary" type="submit">Save</button>
                    </form>
                  </details>
                )}
              </td>
              <td className="sub">{(v.funds ?? []).map(shortFund).join(", ") || "—"}</td>
              <td>
                {v.w9OnFile ? (
                  <span className={`tag ${w9IsOld(v) ? "warn" : "ok"}`}>
                    {w9IsOld(v) ? "On file, over 3 years old" : "On file"}
                    {v.w9Date ? ` · ${fmtDate(v.w9Date)}` : ""}
                  </span>
                ) : (
                  <span className="tag">None on file</span>
                )}
                {finance && v.w9FileId && (
                  <div><a href={`https://drive.google.com/file/d/${v.w9FileId}/view`} target="_blank" rel="noreferrer">Open W-9</a></div>
                )}
              </td>
              <td className="sub nowrap">{v.lastPaidAt ? fmtDate(v.lastPaidAt) : "—"}</td>
              <td className="num">{v.timesPaid ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
