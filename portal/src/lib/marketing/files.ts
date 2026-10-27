/**
 * Files on marketing requests: which types ask for them and what can be
 * added. Plain functions so they can be tested; the upload itself is in
 * lib/marketing/drive.ts.
 *
 * The requester and the marketing team can add files while the request is
 * open or done (a correction after it's finished still helps); nobody adds
 * files to a declined or cancelled request. A Google Drive link still works
 * for anything too big, or too many, to upload.
 */
import type { MarketingFile, MarketingKind } from "./types";

/** Types whose work starts from the requester's own material. */
export const FILE_KINDS: MarketingKind[] = ["graphic", "signage", "highlight", "webpage", "badge", "custom"];
export const asksForFiles = (kind: MarketingKind) => FILE_KINDS.includes(kind);

/** What the form says about files, per type. */
export const FILE_HINT: Partial<Record<MarketingKind, string>> = {
  graphic: "Logos, photos or a rough sketch of what you have in mind.",
  signage: "A photo of where the sign goes, or the wording as a document.",
  highlight: "Photos from the event or of the person or team.",
  webpage: "The page's wording, photos and any documents to link to.",
  badge: "A clear head-and-shoulders photo for the badge.",
  custom: "Anything marketing needs to start.",
};

export const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
/** One upload. A form goes to the server in one piece, and the server takes 30 MB at most. */
export const MAX_PER_UPLOAD = 8;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** All the files on one request. More than this belongs in a shared Drive folder. */
export const MAX_PER_REQUEST = 20;

/** File types marketing can use: images, artwork, documents, slides. */
const ALLOWED = /\.(pdf|png|jpe?g|heic|heif|webp|gif|svg|ai|eps|psd|docx?|pptx?|xlsx?|txt|rtf)$/i;

/** For the file picker. */
export const FILE_ACCEPT = [
  "image/*",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/rtf",
  "application/postscript",
  "application/illustrator",
  "image/vnd.adobe.photoshop",
  ".ai",
  ".eps",
  ".psd",
  ".heic",
];

/** Images only, for an event request's marketing: photos and graphics, no PDFs or documents. */
const IMAGES = /\.(png|jpe?g|heic|heif|webp|gif|svg|tiff?)$/i;

/** For the image picker. */
export const IMAGE_ACCEPT = ["image/png", "image/jpeg", "image/heic", "image/heif", "image/webp", "image/gif", "image/svg+xml", "image/tiff", ".heic", ".heif"];

/**
 * Problems with files about to be added to a request that already has
 * `already` files. `imagesOnly`: an event request's marketing images.
 */
export function checkFiles(files: { name: string; size: number }[], already = 0, o: { imagesOnly?: boolean } = {}): string[] {
  const errors: string[] = [];
  if (files.length > MAX_PER_UPLOAD) errors.push(`Add at most ${MAX_PER_UPLOAD} files at a time. For more, share a Google Drive folder instead.`);
  else if (already + files.length > MAX_PER_REQUEST) errors.push(`A request can have up to ${MAX_PER_REQUEST} files. For more, share a Google Drive folder instead.`);
  for (const f of files) {
    if (o.imagesOnly && !IMAGES.test(f.name)) errors.push(`${f.name}: only images can be added here (JPG, PNG, HEIC, WebP, GIF or SVG), not PDFs or Word documents.`);
    else if (!o.imagesOnly && !ALLOWED.test(f.name)) errors.push(`${f.name}: use an image, PDF, Word, PowerPoint, Excel, Illustrator or Photoshop file.`);
    else if (f.size > MAX_FILE_BYTES) errors.push(`${f.name} is over ${MAX_FILE_MB} MB. Share it with a Google Drive link instead.`);
  }
  if (files.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_BYTES) errors.push("These files are over 25 MB together. Add them a few at a time, or share a Google Drive link.");
  return errors;
}

/** "1.2 MB" or "240 KB". */

/** The files on a request, oldest first (older requests have none). */
export const filesOf = (m: { files?: MarketingFile[] }): MarketingFile[] => m.files ?? [];
