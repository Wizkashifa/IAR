"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { cardStore, ConflictError } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { deliver } from "@/lib/notifications";
import { actorFor } from "@/lib/people";
import { purchaseNotices } from "@/lib/purchases/notices";
import { purchaseContext } from "@/lib/purchases/settings";
import { vendorAfterPayment } from "@/lib/purchases/vendors";
import { batchSummary, mayWorkDesk, runBatch, splitKey } from "@/lib/purchases/finance-desk";
import * as wf from "@/lib/purchases/workflow";
import { RESULT_COOKIE, type DeskResult } from "./result";
import { WorkflowError } from "@/lib/workflow-core";

const VERB = { pay: "marked paid", books: "marked entered in QuickBooks", resolve: "updated with the money received" } as const;
type DeskAction = keyof typeof VERB;

/**
 * Pay, enter in QuickBooks, or record refunds for the requests ticked on the
 * finance desk. Each request goes through the workflow on its own; the ones
 * it refuses, or that changed meanwhile, are listed and the rest still go.
 */
export async function deskAction(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  if (!mayWorkDesk(viewer.actingRoles)) redirect("/purchases/finance");
  const actor = await actorFor(viewer);
  const action = String(form.get("action") ?? "") as DeskAction;
  const backRaw = String(form.get("back") ?? "");
  const back = backRaw.startsWith("/purchases/finance") ? backRaw : "/purchases/finance";
  const keys = [...new Set(form.getAll("pick").map(String))].slice(0, 200);
  if (!(action in VERB) || keys.length === 0) return finish(back, { summary: "Tick at least one request first.", tone: "warn", failed: [] });

  const store = await cardStore();
  const ctx = await purchaseContext();
  const now = new Date().toISOString();
  const method = String(form.get("method") ?? "").trim();
  const reference = String(form.get("reference") ?? "").trim();

  // Several refund lines can belong to one request: group them.
  const lines = new Map<string, string[]>();
  for (const k of keys) {
    const { id, line } = splitKey(k);
    lines.set(id, [...(lines.get(id) ?? []), ...(line ? [line] : [])]);
  }
  const loaded = (await Promise.all([...lines.keys()].map((id) => store.get(id)))).filter(wf.isPurchaseCard);
  const failed: DeskResult["failed"] = [...lines.keys()].filter((id) => !loaded.some((c) => c.id === id)).map((id) => ({ id, message: "Not found." }));

  const result = runBatch(loaded, (c) => {
    if (String(form.get(`v-${c.id}`) ?? "") !== c.updatedAt) throw new WorkflowError("It changed while you were looking. Open it to check before acting.");
    if (action === "pay") return wf.recordPayment(c, actor, now, String(form.get(`method-${c.id}`) ?? "").trim() || method, String(form.get(`ref-${c.id}`) ?? "").trim() || reference);
    if (action === "books") return wf.recordBooks(c, actor, now);
    return (lines.get(c.id) ?? []).reduce((card, line) => wf.resolveLine(card, actor, now, line), c);
  });
  failed.push(...result.failed);

  let saved = 0;
  for (const next of result.done) {
    const before = loaded.find((c) => c.id === next.id)!;
    try {
      await store.save(next, before.updatedAt);
      saved++;
      const a = ctx.routing.approversFor(next.purchase.fund);
      await deliver(purchaseNotices(before, next, actor, { directors: a.directors, chairs: a.chairs }), actor.email);
      // As on the request page: paying a vendor saves them for every committee.
      if (action === "pay") {
        const v = vendorAfterPayment(await store.listVendors(), before.purchase, now);
        if (v) await store.saveVendor(v);
      }
    } catch (err) {
      if (!(err instanceof ConflictError)) console.error("finance desk save failed", err);
      failed.push({ id: next.id, message: err instanceof ConflictError ? err.message : "Couldn't be saved. Nothing changed on it." });
    }
  }
  revalidatePath("/purchases");
  revalidatePath("/purchases/finance");
  const word = `${saved === 1 ? "request" : "requests"} ${VERB[action]}`;
  return finish(back, { summary: batchSummary(saved, word, failed.length), tone: failed.length ? "warn" : "ok", failed });
}

/** The outcome travels in a short-lived cookie matched by a one-time key in the URL, so a link can't fake it. */
async function finish(back: string, r: Omit<DeskResult, "key">): Promise<never> {
  const key = Math.random().toString(36).slice(2, 10);
  (await cookies()).set(RESULT_COOKIE, JSON.stringify({ ...r, key }), { path: "/purchases/finance", maxAge: 60, httpOnly: true, sameSite: "lax" });
  redirect(`${back}${back.includes("?") ? "&" : "?"}r=${key}`);
}
