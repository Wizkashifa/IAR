import "server-only";
import { isDevAuth } from "../dev";
import { uploadToYearFolder } from "../drive";
import type { TicketPhoto } from "./types";

/**
 * Ticket photos go to IAR's Maintenance Photos Shared Drive, one folder per
 * year and one per ticket ("2026 / TK-1001"). The folder ID is in
 * MAINTENANCE_DRIVE_FOLDER_ID; the portal's runtime service account must be a
 * Content manager on that Shared Drive, and the IT and facilities teams'
 * Google Groups need at least Viewer access to open the links.
 *
 * In dev mode files aren't kept, only their names and sizes. Check them with
 * checkPhotos (input.ts) first.
 */
export async function savePhotos(cardId: string, files: File[], by: string, now: Date = new Date()): Promise<TicketPhoto[]> {
  if (files.length === 0) return [];
  const at = now.toISOString();
  const who = by.toLowerCase();
  if (isDevAuth()) return files.map((f) => ({ name: f.name, size: f.size, at, by: who }));
  const root = process.env.MAINTENANCE_DRIVE_FOLDER_ID;
  if (!root) throw new Error("Photo uploads aren't set up yet (MAINTENANCE_DRIVE_FOLDER_ID). See docs/setup.md.");
  const saved = await uploadToYearFolder(root, cardId, files, now);
  return saved.map((f) => ({ ...f, at, by: who }));
}
