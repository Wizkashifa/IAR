/**
 * Checking what someone typed on the "AV/IT/Maintenance request" form, and the photos
 * they attached. Plain functions so they can be tested.
 */
import type { NewTicketInput } from "./workflow";
import { URGENCIES, type TicketKind, type TicketTeam, type Urgency } from "./types";

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 5000;
export const PLACE_MAX = 120;

export type TicketFormInput = Partial<Record<"team" | "title" | "room" | "roomOther" | "equipment" | "urgency" | "description", unknown>>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseTicketInput(raw: TicketFormInput): { ok: true; input: NewTicketInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const team = str(raw.team) as TicketTeam;
  if (team !== "it" && team !== "facilities") errors.push("Choose whether it's for building and maintenance, or for IT, A/V and tech.");
  const kind: TicketKind = "request";
  const title = str(raw.title).replace(/\s+/g, " ");
  if (title.length < 3) errors.push("Say in a few words what's wrong.");
  else if (title.length > TITLE_MAX) errors.push(`Keep the short description under ${TITLE_MAX} characters; put the rest in the details.`);
  let room = str(raw.room);
  const other = str(raw.roomOther);
  if (room === "Other" && other) room = other;
  if (!room) errors.push("Choose where it is.");
  else if (room.length > PLACE_MAX) errors.push(`Keep the location under ${PLACE_MAX} characters.`);
  const equipment = str(raw.equipment) || undefined;
  if (equipment && equipment.length > PLACE_MAX) errors.push(`Keep the equipment under ${PLACE_MAX} characters.`);
  const urgency = (str(raw.urgency) || "normal") as Urgency;
  if (!URGENCIES.includes(urgency)) errors.push("Choose how urgent it is.");
  const description = str(raw.description);
  if (!description) errors.push("Give the details: what happened, when, and anything you already tried.");
  else if (description.length > DESCRIPTION_MAX) errors.push(`Keep the details under ${DESCRIPTION_MAX.toLocaleString()} characters.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, input: { team, kind, title, room, equipment, urgency, description } };
}

export const MAX_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const IMAGE = /\.(jpe?g|png|heic|heif|webp)$/i;

/** Photos only (JPEG, PNG, HEIC from iPhones, WebP), 10 MB each, at most 10 at a time. */
export function checkPhotos(files: { name: string; size: number }[]): string[] {
  const errors: string[] = [];
  if (files.length > MAX_PHOTOS) errors.push(`Attach at most ${MAX_PHOTOS} photos at a time.`);
  for (const f of files) {
    if (!IMAGE.test(f.name)) errors.push(`${f.name}: attach a photo (JPEG, PNG, HEIC or WebP).`);
    if (f.size > MAX_PHOTO_BYTES) errors.push(`${f.name} is over 10 MB.`);
  }
  return errors;
}
