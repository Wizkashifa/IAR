"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { mergeVendors } from "@/lib/purchases/vendors";

const back = (msg: { ok?: string; error?: string }) =>
  redirect(`/purchases/vendors?${msg.error ? `error=${encodeURIComponent(msg.error)}` : `ok=${msg.ok}`}`);

/** Finance fixes a saved vendor's name, address or contact. The ID stays, so past requests still find it. */
export async function updateVendor(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  if (!viewer.actingRoles.includes("finance")) back({ error: "Only the finance office edits saved vendors." });
  const store = await cardStore();
  const v = (await store.listVendors()).find((x) => x.id === String(form.get("id") ?? ""));
  if (!v) back({ error: "That vendor no longer exists." });
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  if (!name) back({ error: "A vendor needs a name." });
  const text = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max) || undefined;
  await store.saveVendor({ ...v!, name, address: text("address", 300), contact: text("contact", 120) });
  revalidatePath("/purchases/vendors");
  back({ ok: "saved" });
}

/** Finance folds a duplicate record into the one to keep. */
export async function mergeVendor(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  if (!viewer.actingRoles.includes("finance")) back({ error: "Only the finance office merges saved vendors." });
  const store = await cardStore();
  const all = await store.listVendors();
  const keep = all.find((x) => x.id === String(form.get("keep") ?? ""));
  const drop = all.find((x) => x.id === String(form.get("drop") ?? ""));
  if (!keep || !drop || keep.id === drop.id) back({ error: "Choose two different vendors to merge." });
  let merged;
  try {
    merged = mergeVendors(keep!, drop!);
  } catch (err) {
    back({ error: err instanceof Error ? err.message : "Those vendors can't be merged." });
  }
  await store.saveVendor(merged!);
  await store.deleteVendor(drop!.id);
  revalidatePath("/purchases/vendors");
  back({ ok: "merged" });
}
