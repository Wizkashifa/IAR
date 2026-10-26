import "server-only";
import { isDevAuth } from "../dev";
import { uploadToYearFolder } from "../drive";
import { MARKETING_TYPES } from "./forms";
import type { MarketingFile, MarketingKind } from "./types";

/**
 * Marketing request files go to the "Marketing Files" Shared Drive go-live
 * makes (MARKETING_DRIVE_FOLDER_ID), one folder per year and one per request
 * ("2026 / MK-1004 · Graphic design"). The portal's runtime service account
 * and the marketing team's Google Group are Content managers on it.
 *
 * Until the folder is set, the forms still work: people share a Google Drive
 * link instead. In dev mode files aren't kept, only their names and sizes.
 * Check them with checkFiles (files.ts) first.
 */

/** The folder files go in, or null when uploads aren't set up (dev mode always takes them). */
export async function marketingFolder(): Promise<string | null> {
  if (isDevAuth()) return "dev";
  return process.env.MARKETING_DRIVE_FOLDER_ID || null;
}

export const NOT_SET_UP = "File uploads for marketing aren't set up yet. Share your files with a Google Drive link instead.";

export async function saveMarketingFiles(cardId: string, kind: MarketingKind, files: File[], now: Date = new Date()): Promise<Omit<MarketingFile, "at" | "by">[]> {
  if (files.length === 0) return [];
  if (isDevAuth()) return files.map((f) => ({ name: f.name, size: f.size }));
  const root = await marketingFolder();
  if (!root) throw new Error(NOT_SET_UP);
  return uploadToYearFolder(root, `${cardId} · ${MARKETING_TYPES[kind].label}`, files, now);
}
