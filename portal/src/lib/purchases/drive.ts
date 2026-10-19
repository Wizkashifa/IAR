import "server-only";
import { GoogleAuth } from "google-auth-library";
import { isDevAuth } from "../dev";
import { shortFund } from "./accounts";
import type { Attachment } from "./types";

/**
 * Receipts and invoices go to IAR's PO records Shared Drive, one folder per
 * year and one subfolder per request ("2026 / PO-12001 · Youth"). The portal's
 * runtime service account must be a Content manager on that Shared Drive; no
 * personal Drive is ever involved. W-9s are NOT uploaded here: they go only to
 * the restricted W-9 drive, which finance manages.
 *
 * In dev mode files aren't kept, only their names and sizes.
 */

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

/** Non-empty files from a form field. */
export function filesFrom(form: FormData, field: string): File[] {
  return form.getAll(field).filter((v): v is File => typeof v === "object" && v !== null && "size" in v && (v as File).size > 0);
}

let auth: GoogleAuth | null = null;
async function driveToken(): Promise<string> {
  auth ??= new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive"] });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  if (!t.token) throw new Error("No Drive access token.");
  return t.token;
}

const API = "https://www.googleapis.com/drive/v3/files";
const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function findOrCreateFolder(token: string, parent: string, name: string): Promise<string> {
  const search = new URL(API);
  search.searchParams.set("q", `'${q(parent)}' in parents and name = '${q(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  search.searchParams.set("fields", "files(id)");
  search.searchParams.set("supportsAllDrives", "true");
  search.searchParams.set("includeItemsFromAllDrives", "true");
  search.searchParams.set("corpora", "allDrives");
  const found = await fetch(search, { headers: { authorization: `Bearer ${token}` } });
  if (!found.ok) throw new Error(`Drive search failed: ${found.status}`);
  const hit = ((await found.json()) as { files?: { id: string }[] }).files?.[0];
  if (hit) return hit.id;
  const res = await fetch(`${API}?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name, parents: [parent], mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!res.ok) throw new Error(`Drive folder create failed: ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

async function upload(token: string, folder: string, file: File): Promise<Attachment> {
  const boundary = `iar${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: file.name, parents: [folder] });
  const head = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${file.type || "application/octet-stream"}\r\n\r\n`;
  const body = new Blob([head, await file.arrayBuffer(), `\r\n--${boundary}--`]);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed for ${file.name}: ${res.status}`);
  const out = (await res.json()) as { id: string; webViewLink?: string };
  return { name: file.name, size: file.size, driveFileId: out.id, url: out.webViewLink };
}

/** Store a request's files. Call after the card has its ID. */
export async function saveAttachments(cardId: string, fund: string, files: File[], now: Date = new Date()): Promise<Attachment[]> {
  if (files.length === 0) return [];
  if (isDevAuth()) return files.map((f) => ({ name: f.name, size: f.size }));
  const root = process.env.PO_DRIVE_FOLDER_ID;
  if (!root) throw new Error("Receipt uploads aren't set up yet (PO_DRIVE_FOLDER_ID). See docs/setup.md.");
  const token = await driveToken();
  const year = await findOrCreateFolder(token, root, String(now.getFullYear()));
  const folder = await findOrCreateFolder(token, year, `${cardId} · ${shortFund(fund)}`);
  const out: Attachment[] = [];
  for (const f of files) out.push(await upload(token, folder, f));
  return out;
}
