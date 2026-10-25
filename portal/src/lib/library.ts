import "server-only";
import { GoogleAuth } from "google-auth-library";
import { todayLocal } from "./away";
import { isDevAuth } from "./dev";
import { reportFailure, reportOk } from "./health";
import { buildLibrary, driveSearchQuery, matchFiles, type DriveItem, type Library, type LibraryFile } from "./library-core";
import { portalSettings } from "./portal-settings";
import { policyFile, type PolicyKey } from "./policy-links";

/**
 * The Library: IAR's Policies Shared Drive, listed read-only. The portal's
 * own service account reads it with the read-only Drive scope; an admin adds
 * that account to the drive as a Viewer and pastes the drive's link in Portal
 * Settings. Files open in Google Drive; the portal keeps no copies. Dev mode
 * shows a sample drive.
 */

export type LibraryState = { state: "ok"; library: Library } | { state: "unset" } | { state: "error" };

const LIST_MS = 5 * 60 * 1000;
const SEARCH_MS = 2 * 60 * 1000;
const FIELDS = "nextPageToken,files(id,name,mimeType,parents,modifiedTime,webViewLink,description,properties,lastModifyingUser(displayName))";
const API = "https://www.googleapis.com/drive/v3/files";

const g = globalThis as unknown as { __iarLibrary?: { list: Map<string, { at: number; lib: Library }>; search: Map<string, { at: number; files: LibraryFile[] }> } };
const cache = (g.__iarLibrary ??= { list: new Map(), search: new Map() });

let auth: GoogleAuth | null = null;
async function readToken(): Promise<string> {
  auth ??= new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
  const t = await (await auth.getClient()).getAccessToken();
  if (!t.token) throw new Error("No Drive access token.");
  return t.token;
}

async function driveList(driveId: string, q: string, maxPages: number): Promise<DriveItem[]> {
  const token = await readToken();
  const out: DriveItem[] = [];
  let page: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const url = new URL(API);
    for (const [k, v] of Object.entries({ corpora: "drive", driveId, includeItemsFromAllDrives: "true", supportsAllDrives: "true", q, fields: FIELDS, pageSize: "1000" })) url.searchParams.set(k, v);
    if (page) url.searchParams.set("pageToken", page);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const body = (await res.json()) as { files?: DriveItem[]; nextPageToken?: string };
    out.push(...(body.files ?? []));
    page = body.nextPageToken;
    if (!page) break;
  }
  return out;
}

/** The drive ID from Portal Settings, or the sample in dev mode. */
async function policiesDriveId(): Promise<string | null> {
  if (isDevAuth()) return DEV_DRIVE;
  return (await portalSettings()).policiesDrive || null;
}

/** Every file in the Policies drive, by top-level folder. Cached for a few minutes. */
export async function policiesLibrary(): Promise<LibraryState> {
  const driveId = await policiesDriveId();
  if (!driveId) return { state: "unset" };
  if (driveId === DEV_DRIVE) return { state: "ok", library: buildLibrary(devItems(), DEV_DRIVE) };
  const hit = cache.list.get(driveId);
  if (hit && Date.now() - hit.at < LIST_MS) return { state: "ok", library: hit.lib };
  try {
    const lib = buildLibrary(await driveList(driveId, "trashed = false", 5), driveId);
    cache.list.set(driveId, { at: Date.now(), lib });
    reportOk("drive");
    return { state: "ok", library: lib };
  } catch (err) {
    reportFailure("drive", err);
    // A stale list beats none while Drive is down.
    return hit ? { state: "ok", library: hit.lib } : { state: "error" };
  }
}

/** Policies matching the words, by file name or the text inside. Null when the drive isn't set up or can't be reached. */
export async function searchPolicies(raw: string): Promise<LibraryFile[] | null> {
  const q = raw.trim().slice(0, 100);
  if (!q) return [];
  const listed = await policiesLibrary();
  if (listed.state !== "ok") return null;
  const driveId = (await policiesDriveId())!;
  if (driveId === DEV_DRIVE) return matchFiles(listed.library.files, q);
  const key = `${driveId}|${q.toLowerCase()}`;
  const hit = cache.search.get(key);
  if (hit && Date.now() - hit.at < SEARCH_MS) return hit.files;
  try {
    const ids = new Set((await driveList(driveId, driveSearchQuery(q), 1)).map((f) => f.id));
    // Drive finds the matches; the listing knows their folders and review dates.
    const files = listed.library.files.filter((f) => ids.has(f.id));
    if (cache.search.size > 200) cache.search.clear();
    cache.search.set(key, { at: Date.now(), files });
    return files;
  } catch (err) {
    reportFailure("drive", err);
    return matchFiles(listed.library.files, q);
  }
}

/** The link to a policy's current file in the Library, for a form that cites it. Undefined when the Library isn't connected or has no such file. */
export async function libraryPolicyUrl(key: PolicyKey): Promise<string | undefined> {
  const listed = await policiesLibrary().catch(() => null);
  return listed?.state === "ok" ? policyFile(key, listed.library.files)?.url : undefined;
}

/** The account an admin adds to the Policies drive as a Viewer: the portal's own service account. Null in dev mode or when it can't be told. */
export async function libraryReader(): Promise<string | null> {
  if (isDevAuth()) return null;
  if (process.env.DIRECTORY_SERVICE_ACCOUNT) return process.env.DIRECTORY_SERVICE_ACCOUNT;
  try {
    auth ??= new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
    return (await auth.getCredentials()).client_email ?? null;
  } catch {
    return null;
  }
}

/* ---- Dev mode: a sample Policies drive ------------------------------- */

const DEV_DRIVE = "dev-policies-drive";

function devItems(): DriveItem[] {
  const today = todayLocal();
  const day = (offset: number) => new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  const at = (offset: number) => `${day(offset)}T15:00:00.000Z`;
  const folder = (id: string, name: string): DriveItem => ({ id, name, mimeType: "application/vnd.google-apps.folder", parents: [DEV_DRIVE] });
  const file = (id: string, name: string, mimeType: string, parent: string, updated: number, by: string, review?: number): DriveItem => ({
    id,
    name,
    mimeType,
    parents: [parent],
    modifiedTime: at(updated),
    webViewLink: `https://drive.google.com/file/d/${id}/view`,
    lastModifyingUser: { displayName: by },
    description: review === undefined ? undefined : `Review by ${day(review)}`,
  });
  const DOC = "application/vnd.google-apps.document";
  const PDF = "application/pdf";
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return [
    folder("f-rooms", "Rooms and rentals"),
    folder("f-purchasing", "Purchasing"),
    folder("f-people", "People"),
    folder("f-drafts", "Drafts"),
    folder("f-archive", "Archive"),
    file("p-room-use", "Room reservation policy", DOC, "f-rooms", -210, "Office Admin", -20),
    file("p-catering", "Food and catering rules", PDF, "f-rooms", -140, "Office Admin", 10),
    file("p-rental-terms", "Facility rental terms (draft for Shura)", DOCX, "f-drafts", -6, "Office Admin", 30),
    file("p-purchasing", "Purchasing and reimbursement policy", PDF, "f-purchasing", -95, "Bookkeeper", 90),
    file("p-volunteer", "Volunteer code of conduct", PDF, "f-people", -300, "Office Admin", 200),
    file("p-youth-safety", "Youth safety and supervision guidelines", DOC, "f-people", -40, "Youth Chair", 330),
    file("p-room-2023", "Room reservation policy (2023 version)", DOCX, "f-archive", -900, "Office Admin"),
  ];
}
