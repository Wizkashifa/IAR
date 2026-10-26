import { NextResponse } from "next/server";
import { todayLocal } from "@/lib/dates";
import { formStartStore } from "@/lib/form-starts";
import { isFormName } from "@/lib/measures";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/**
 * Someone started typing in a request form (components/useFormStarted.ts).
 * Counts it for the beta measures: the form's name and today's date only,
 * never who it was or what they typed. Signed-in people only.
 */
export async function POST(req: Request) {
  if (!(await getViewer())) return new NextResponse(null, { status: 401 });
  const body = (await req.json().catch(() => null)) as { form?: unknown } | null;
  if (!isFormName(body?.form)) return new NextResponse(null, { status: 400 });
  await (await formStartStore()).add(body.form, todayLocal());
  return new NextResponse(null, { status: 204 });
}
