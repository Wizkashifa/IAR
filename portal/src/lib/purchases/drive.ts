import "server-only";
import { isDevAuth } from "../dev";
import { driveToken, uploadFile, uploadToYearFolder } from "../drive";
import { shortFund } from "./accounts";
import type { Attachment } from "./types";

/**
 * Receipts and invoices go to IAR's PO records Shared Drive, one folder per
 * year and one subfolder per request ("2026 / PO-12001 · Youth"). The portal's
 * runtime service account must be a Content manager on that Shared Drive; no
 * personal Drive is ever involved. W-9s are NOT uploaded here: they go only to
 * the restricted W-9 drive, which finance manages (saveW9 below). The service
 * account is only a Contributor there, so it can add files but nobody gets a
 * link back through the portal except finance.
 *
 * In dev mode files aren't kept, only their names and sizes. The Drive calls
 * themselves are in lib/drive.ts.
 */

export { filesFrom } from "../drive";

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED = /\.(pdf|png|jpe?g|heic|webp|gif|docx?|xlsx?|csv|txt)$/i;

export function checkFiles(files: File[]): string[] {
  const errors: string[] = [];
  if (files.length > MAX_FILES) errors.push(`Attach at most ${MAX_FILES} files.`);
  for (const f of files) {
    if (!ALLOWED.test(f.name)) errors.push(`${f.name}: use a PDF, image, Word, Excel or text file.`);
    if (f.size > MAX_FILE_BYTES) errors.push(`${f.name} is over 10 MB.`);
  }
  return errors;
}

const W9_ALLOWED = /\.(pdf|png|jpe?g|heic|webp)$/i;

/** One W-9: a PDF or a photo of it, 10 MB at most. */
export function checkW9(files: File[]): string[] {
  if (files.length > 1) return ["Attach one W-9."];
  const f = files[0];
  if (!f) return [];
  if (!W9_ALLOWED.test(f.name)) return [`${f.name}: the W-9 must be a PDF or a photo.`];
  if (f.size > MAX_FILE_BYTES) return [`${f.name} is over 10 MB.`];
  return [];
}

/** Store a request's files. Call after the card has its ID. */
export async function saveAttachments(cardId: string, fund: string, files: File[], now: Date = new Date()): Promise<Attachment[]> {
  if (files.length === 0) return [];
  if (isDevAuth()) return files.map((f) => ({ name: f.name, size: f.size }));
  const root = process.env.PO_DRIVE_FOLDER_ID;
  if (!root) throw new Error("Receipt uploads aren't set up yet (PO_DRIVE_FOLDER_ID). See docs/setup.md.");
  return uploadToYearFolder(root, `${cardId} · ${shortFund(fund)}`, files, now);
}

/**
 * Store a W-9 in the restricted W-9 drive as "W-9 — <payee> — <date>.pdf".
 * Returns the file name and Drive ID; the ID goes only on the vendor record
 * and the request, for finance.
 */
export async function saveW9(payee: string, file: File, now: Date = new Date()): Promise<{ name: string; driveFileId?: string }> {
  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? ".pdf";
  const name = `W-9 — ${payee.replace(/[\\/:*?"<>|]+/g, " ").trim()} — ${now.toISOString().slice(0, 10)}${ext}`;
  if (isDevAuth()) return { name };
  const root = process.env.W9_DRIVE_FOLDER_ID;
  if (!root) throw new Error("W-9 uploads aren't set up yet (W9_DRIVE_FOLDER_ID). See docs/setup.md.");
  const token = await driveToken();
  const renamed = new File([await file.arrayBuffer()], name, { type: file.type });
  const out = await uploadFile(token, root, renamed);
  return { name, driveFileId: out.driveFileId };
}
