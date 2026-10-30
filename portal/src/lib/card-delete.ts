import "server-only";
import { audit } from "./audit";
import { type Card, type CardType, cardStore } from "./cards";
import { beforeDeletingEvent } from "./events/remove";
import { isEventCard } from "./events/workflow";
import type { Notice } from "./notices";
import { deliver, removeNotificationsFor } from "./notifications";
import type { Viewer } from "./viewer";

/**
 * Deleting a request for good, for portal admins (demos, tests, mistakes).
 * The request and the bell's notifications about it go; files already in
 * Google Drive stay there. Each kind can tidy up first: an event takes its
 * holds off the room calendars and settles any asks for a booked time.
 */

/**
 * Portal admins. An admin signed in as someone else sees exactly what that
 * person sees, so not this (unless the person is an admin too).
 */
export const mayDeleteRequests = (viewer: Pick<Viewer, "actingRoles">) => viewer.actingRoles.includes("admins");

type Cleanup = (card: Card, by: string) => Promise<{ notices: Notice[]; problems: string[] }>;

const BEFORE_DELETE: Partial<Record<CardType, Cleanup>> = {
  event: (card, by) => (isEventCard(card) ? beforeDeletingEvent(card, by) : Promise.resolve({ notices: [], problems: [] })),
};

/** Deletes the request; returns anything that couldn't be tidied up (for the admin to fix by hand). */
export async function deleteCard(card: Card, viewer: Viewer): Promise<string[]> {
  const admin = viewer.supportAdmin?.email ?? viewer.email;
  const { notices, problems } = (await BEFORE_DELETE[card.type]?.(card, admin)) ?? { notices: [], problems: [] };
  await (await cardStore()).remove(card.id);
  try {
    await removeNotificationsFor(card.id);
  } catch (err) {
    console.error("removing notifications for a deleted request failed", err);
  }
  await deliver(notices, admin);
  // Signed in as someone else, the store already wrote this to the audit log.
  if (!viewer.supportAdmin) await audit({ admin, target: admin, action: `Deleted ${card.id} “${card.title}”` });
  return problems;
}
