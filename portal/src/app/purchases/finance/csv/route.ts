import { cardStore } from "@/lib/cards";
import { getViewer } from "@/lib/viewer";
import { deskCards, filterDesk, isDeskTab, isPayType } from "@/lib/purchases/finance-desk";
import { qbCsv } from "@/lib/purchases/qb-csv";
import { isPurchaseCard } from "@/lib/purchases/workflow";

export const dynamic = "force-dynamic";

/** The finance desk's current list as a CSV for QuickBooks. Finance only. */
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer || !viewer.roles.includes("finance")) return new Response("Not available.", { status: 404 });
  const q = new URL(req.url).searchParams;
  const tab = isDeskTab(q.get("tab") ?? undefined) ? (q.get("tab") as "pay" | "books" | "returns") : "pay";
  const month = /^\d{4}-\d{2}$/.test(q.get("month") ?? "") ? q.get("month")! : undefined;
  const type = q.get("type") ?? undefined;
  const open = (await (await cardStore()).listOpenPurchases()).filter(isPurchaseCard);
  const cards = filterDesk(deskCards(open, tab), { fund: q.get("fund") || undefined, month, type: isPayType(type) ? type : undefined });
  const name = `iar-purchases-${tab}${month ? `-${month}` : ""}.csv`;
  return new Response(qbCsv(cards), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
