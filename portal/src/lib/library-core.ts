/**
 * The Library's plain functions: what a Drive file is, which folder it sits
 * in, when its policy is due for review, and how a search reads. No Google
 * calls here (those are in lib/library.ts), so it can be tested.
 *
 * The files stay in IAR's Policies Shared Drive; the portal only lists them
 * and links to them. Nothing is copied.
 */
import { daysBetween } from "./dates";
import { longDate } from "./events/series";

/** One file or folder as Drive lists it (the fields lib/library.ts asks for). */
export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  modifiedTime?: string;
  webViewLink?: string;
  description?: string;
  properties?: Record<string, string>;
  lastModifyingUser?: { displayName?: string };
};

/** A file as the Library shows it. */
export type LibraryFile = {
  id: string;
  name: string;
  kind: FileKind;
  /** The top-level folder it sits in (under the drive), or "" at the top. */
  folderId: string;
  folder: string;
  updated?: string;
  updatedBy?: string;
  url: string;
  /** "YYYY-MM-DD" when the policy is due for review, if the file says. */
  reviewBy?: string;
};

export type LibraryFolder = { id: string; name: string; count: number };
export type Library = { files: LibraryFile[]; folders: LibraryFolder[] };

export type FileKind = { label: string; icon: "book" | "pie" | "receipt" | "monitor" | "folder" | "inbox" };

const FOLDER = "application/vnd.google-apps.folder";

/** What kind of file, in words, and the icon to show beside it. */
export function kindOf(mimeType: string): FileKind {
  if (mimeType === FOLDER) return { label: "Folder", icon: "folder" };
  if (mimeType === "application/vnd.google-apps.document") return { label: "Google Doc", icon: "book" };
  if (mimeType === "application/vnd.google-apps.spreadsheet") return { label: "Google Sheet", icon: "pie" };
  if (mimeType === "application/vnd.google-apps.presentation") return { label: "Google Slides", icon: "monitor" };
  if (mimeType === "application/pdf") return { label: "PDF", icon: "receipt" };
  if (/wordprocessingml|msword/.test(mimeType)) return { label: "Word document", icon: "book" };
  if (/spreadsheetml|ms-excel|text\/csv/.test(mimeType)) return { label: "Spreadsheet", icon: "pie" };
  if (/presentationml|ms-powerpoint/.test(mimeType)) return { label: "Presentation", icon: "monitor" };
  return { label: "File", icon: "inbox" };
}

/**
 * The drive ID from what an admin pastes: the ID itself, or the drive's
 * address from the browser (https://drive.google.com/drive/folders/<id>,
 * or …/drive/u/0/folders/<id>). Null when it isn't either.
 */
export function parseDriveId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null;
}

/**
 * When a policy is due for review. Set in Drive, in the file's description
 * ("Review by 2027-01-23"), or as a `reviewBy` property.
 */
export function reviewDate(item: Pick<DriveItem, "description" | "properties">): string | undefined {
  const prop = item.properties?.reviewBy;
  if (prop && /^\d{4}-\d{2}-\d{2}$/.test(prop)) return prop;
  const m = /review(?:\s+by|\s+date)?\s*:?\s*(\d{4}-\d{2}-\d{2})/i.exec(item.description ?? "");
  return m?.[1];
}

/** The review pill: overdue (red), due within 30 days (warn), or just the date. */
export function reviewState(reviewBy: string, today: string): { tone: "bad" | "warn" | "neutral"; label: string } {
  const d = daysBetween(today, reviewBy);
  if (d < 0) return { tone: "bad", label: `Review overdue since ${longDate(reviewBy)}` };
  if (d <= 30) return { tone: "warn", label: d === 0 ? "Review due today" : `Review due ${longDate(reviewBy)}` };
  return { tone: "neutral", label: `Review by ${longDate(reviewBy)}` };
}

/**
 * Files and top-level folders from everything Drive listed in the drive.
 * A file deep in subfolders shows under its top-level folder. Newest first.
 */
export function buildLibrary(items: DriveItem[], driveId: string): Library {
  const byId = new Map(items.map((i) => [i.id, i]));
  // The folder just under the drive that holds this item; null at the top or when unknown.
  const topOf = (item: DriveItem): DriveItem | null => {
    let top: DriveItem | null = null;
    let parent = item.parents?.[0];
    for (let hops = 0; parent && parent !== driveId && hops < 20; hops++) {
      const node = byId.get(parent);
      if (!node) return null;
      top = node;
      parent = node.parents?.[0];
    }
    return parent === driveId ? top : null;
  };
  const files: LibraryFile[] = items
    .filter((i) => i.mimeType !== FOLDER)
    .map((i) => {
      const top = topOf(i);
      return {
        id: i.id,
        name: i.name,
        kind: kindOf(i.mimeType),
        folderId: top?.id ?? "",
        folder: top?.name ?? "",
        updated: i.modifiedTime,
        updatedBy: i.lastModifyingUser?.displayName,
        url: i.webViewLink ?? `https://drive.google.com/file/d/${encodeURIComponent(i.id)}/view`,
        reviewBy: reviewDate(i),
      };
    })
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
  const folders: LibraryFolder[] = items
    .filter((i) => i.mimeType === FOLDER && i.parents?.[0] === driveId)
    .map((f) => ({ id: f.id, name: f.name, count: files.filter((x) => x.folderId === f.id).length }))
    // A-Z, with old versions (Archive) at the end.
    .sort((a, b) => Number(/archive/i.test(a.name)) - Number(/archive/i.test(b.name)) || a.name.localeCompare(b.name));
  return { files, folders };
}

/** Drive's `q` for a search inside the drive: the name or the text inside the file. */
export function driveSearchQuery(q: string): string {
  const words = q.trim().slice(0, 100).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `trashed = false and mimeType != '${FOLDER}' and (name contains '${words}' or fullText contains '${words}')`;
}

/** Files whose name has every word of the search (dev mode, and to rank Drive's results). */
export function matchFiles(files: LibraryFile[], q: string): LibraryFile[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return files.filter((f) => {
    const hay = `${f.name} ${f.folder}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
