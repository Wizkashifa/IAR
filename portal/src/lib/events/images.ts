/**
 * Images for marketing on a public event request: the requester adds them on
 * the form (or later, on the request page), and the marketing team can add
 * them too. They're kept in the marketing Shared Drive under "Event Requests /
 * <event name>" (lib/marketing/drive.ts). Images only: no PDFs or documents
 * (checkFiles with imagesOnly, lib/marketing/files.ts). Plain functions so
 * they can be tested.
 */
import type { MarketingFile } from "../marketing/types";
import { MAX_PER_REQUEST } from "../marketing/files";
import { same } from "../text";
import { historyEntry, WorkflowError } from "../workflow-core";
import type { EventActor, EventCard } from "./workflow";

export const imagesOf = (card: EventCard): MarketingFile[] => card.event.images ?? [];

/** Whether `actor` can add images now: the requester, marketing or the office, on a public event that's still going. */
export function imagesPermission(card: EventCard, actor: EventActor): { ok: true } | { ok: false; reason: string } {
  if (!card.event.isPublic) return { ok: false, reason: "Only public events have images for marketing." };
  if (!same(card.ownerEmail, actor.email) && !actor.roles.includes("marketing") && !actor.roles.includes("office")) return { ok: false, reason: "Only the requester and the marketing team can add images." };
  if (card.status === "denied" || card.status === "cancelled") return { ok: false, reason: "This request is closed, so no more images can be added." };
  return { ok: true };
}

/** The card with images added (already uploaded and checked). Its stage doesn't change. */
export function addImages(card: EventCard, actor: EventActor, now: string, files: Omit<MarketingFile, "at" | "by">[]): EventCard {
  const p = imagesPermission(card, actor);
  if (!p.ok) throw new WorkflowError(p.reason);
  if (files.length === 0) throw new WorkflowError("Choose an image first.");
  const had = imagesOf(card);
  if (had.length + files.length > MAX_PER_REQUEST) throw new WorkflowError(`An event can have up to ${MAX_PER_REQUEST} images. For more, share a Google Drive folder in a comment.`);
  const by = actor.email.toLowerCase();
  const n = files.length;
  return {
    ...card,
    event: {
      ...card.event,
      images: [...had, ...files.map((f) => ({ ...f, at: now, by }))],
      history: [...card.event.history, historyEntry(actor.email, now, `Added ${n} image${n === 1 ? "" : "s"} for marketing`, files.map((f) => f.name).join(", "))],
    },
    updatedAt: now,
  };
}
