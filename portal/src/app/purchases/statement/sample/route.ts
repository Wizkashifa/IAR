import { notFound } from "next/navigation";
import { isDevAuth } from "@/lib/dev";
import { samplePdf, sampleStatementPages } from "@/lib/purchases/statement-sample";

/** Dev only: a made-up statement for this month, to try the import with. */
export async function GET() {
  if (!isDevAuth()) notFound();
  const month = new Date().toISOString().slice(0, 7);
  return new Response(Buffer.from(samplePdf(sampleStatementPages(month))), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="Sample card statement ${month}.pdf"` },
  });
}
