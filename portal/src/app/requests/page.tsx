import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { cardStore, STATUS_LABEL, TYPE_LABEL } from "@/lib/cards";
import { hrefOf } from "@/lib/card-links";

export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const fmtMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function MyRequests() {
  const viewer = await requireViewer();
  const cards = await (await cardStore()).listByOwner(viewer.email);

  return (
    <>
      <h1>My Requests</h1>
      <p className="lead">Everything you&apos;ve asked for: events, purchases, marketing and IT &amp; maintenance requests, newest activity first.</p>
      {cards.length === 0 ? (
        <div className="panel empty">You haven&apos;t submitted anything yet.</div>
      ) : (
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Status</th>
                <th>Waiting on</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id}>
                  <td>
                    {hrefOf(c) ? (
                      <Link href={hrefOf(c)!}>
                        <strong>{c.title}</strong>
                      </Link>
                    ) : (
                      <strong>{c.title}</strong>
                    )}
                    <div className="sub">
                      {TYPE_LABEL[c.type]} {c.id} · {c.committee}
                      {c.eventDate && ` · ${fmtDate(c.eventDate + "T12:00:00")}`}
                      {c.amount !== undefined && ` · ${fmtMoney(c.amount)}`}
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${c.status}`}>{STATUS_LABEL[c.status]}</span>
                  </td>
                  <td>{c.waitingOn ?? <span className="sub">Nothing</span>}</td>
                  <td className="sub">{fmtDate(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
