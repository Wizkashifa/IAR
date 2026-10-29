"use server";
import { randomUUID } from "node:crypto";
import { requireViewer } from "@/lib/viewer";
import { checkFiles, saveCardReceipt } from "@/lib/purchases/drive";
import { cardsHeldBy, purchaseContext } from "@/lib/purchases/settings";
import { statementFor } from "@/lib/purchases/statement-context";
import { receiptUploadStore } from "@/lib/purchases/receipt-uploads";

export type UploadResult = { ok: true; id: string; name: string } | { ok: false; error: string };

/**
 * One receipt for a card charge, uploaded the moment it's chosen (so a big
 * month never has to go up in one send). Only the card's holder, for a
 * month whose statement is in. Returns the upload's id for the form.
 */
export async function uploadCardReceipt(form: FormData): Promise<UploadResult> {
  const viewer = await requireViewer();
  const last4 = String(form.get("last4") ?? "");
  const month = String(form.get("month") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose the receipt first." };
  const bad = checkFiles([file]);
  if (bad.length) return { ok: false, error: bad[0] };
  if (!cardsHeldBy(await purchaseContext(), viewer.email).some((c) => c.last4 === last4)) return { ok: false, error: "That isn't one of your IAR cards." };
  if (!(await statementFor(last4, month)).statement) return { ok: false, error: "That month's statement has no charges on this card." };
  try {
    const attachment = await saveCardReceipt(last4, month, file);
    const id = randomUUID();
    await (await receiptUploadStore()).save({ id, ownerEmail: viewer.email.toLowerCase(), last4, month, attachment, at: new Date().toISOString() });
    return { ok: true, id, name: attachment.name };
  } catch (err) {
    console.error("card receipt upload failed", err);
    return { ok: false, error: "It didn't upload. Try again." };
  }
}
