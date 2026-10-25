import "server-only";
import { GoogleAuth } from "google-auth-library";
import { failed } from "./health";

/**
 * Uploads to IAR's Shared Drives, for every module that keeps files
 * (purchase receipts, maintenance photos). The portal's runtime service
 * account signs in as itself (no key file) and must be a Content manager on
 * each Shared Drive it files into; no personal Drive is ever involved.
 */

export type DriveFile = {
  name: string;
  size: number;
  /** Google Drive file ID (production). */
  driveFileId?: string;
  url?: string;
};

/** Non-empty files from a form field. */
export function filesFrom(form: FormData, field: string): File[] {
  return form.getAll(field).filter((v): v is File => typeof v === "object" && v !== null && "size" in v && (v as File).size > 0);
}

let auth: GoogleAuth | null = null;
export async function driveToken(): Promise<string> {
  auth ??= new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive"] });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  if (!t.token) throw new Error("No Drive access token.");
  return t.token;
}

const API = "https://www.googleapis.com/drive/v3/files";
const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** The folder called `name` inside `parent`, created if it isn't there yet. */
export async function findOrCreateFolder(token: string, parent: string, name: string): Promise<string> {
  const search = new URL(API);
  search.searchParams.set("q", `'${q(parent)}' in parents and name = '${q(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  search.searchParams.set("fields", "files(id)");
  search.searchParams.set("supportsAllDrives", "true");
  search.searchParams.set("includeItemsFromAllDrives", "true");
  search.searchParams.set("corpora", "allDrives");
  const found = await fetch(search, { headers: { authorization: `Bearer ${token}` } });
  if (!found.ok) throw failed("drive", `Drive search failed: ${found.status}`);
  const hit = ((await found.json()) as { files?: { id: string }[] }).files?.[0];
  if (hit) return hit.id;
  const res = await fetch(`${API}?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name, parents: [parent], mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!res.ok) throw failed("drive", `Drive folder create failed: ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

/** Upload one file into a folder. */
export async function uploadFile(token: string, folder: string, file: File): Promise<DriveFile> {
  const boundary = `iar${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: file.name, parents: [folder] });
  const head = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${file.type || "application/octet-stream"}\r\n\r\n`;
  const body = new Blob([head, await file.arrayBuffer(), `\r\n--${boundary}--`]);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw failed("drive", `Drive upload failed for ${file.name}: ${res.status}`);
  const out = (await res.json()) as { id: string; webViewLink?: string };
  return { name: file.name, size: file.size, driveFileId: out.id, url: out.webViewLink };
}

/** Upload files into `root / <year> / <folder>`, creating the folders as needed. */
export async function uploadToYearFolder(root: string, folder: string, files: File[], now: Date = new Date()): Promise<DriveFile[]> {
  const token = await driveToken();
  const year = await findOrCreateFolder(token, root, String(now.getFullYear()));
  const dest = await findOrCreateFolder(token, year, folder);
  const out: DriveFile[] = [];
  for (const f of files) out.push(await uploadFile(token, dest, f));
  return out;
}
