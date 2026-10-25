"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cardStore, ConflictError } from "@/lib/cards";
import { internalPath } from "@/lib/links";
import { nameResolver } from "@/lib/names";
import { deliver } from "@/lib/notifications";
import { canRemind, mayOpenStuck, reminderNotices, stuckItems, whoWaiting, withReminder } from "@/lib/stuck";
import { requireViewer } from "@/lib/viewer";
import { needsContext } from "@/lib/waiting";

/** Back to the list with the same filters, plus a note. */
function back(form: FormData, note: Record<string, string>): never {
  const path = internalPath(String(form.get("back") ?? ""));
  const url = new URL(path?.startsWith("/stuck") ? path : "/stuck", "http://portal");
  for (const k of ["sent", "error"]) url.searchParams.delete(k);
  for (const [k, v] of Object.entries(note)) url.searchParams.set(k, v);
  redirect(`${url.pathname}${url.search}`);
}

/**
 * "Send a reminder" on What's stuck: one alert to whoever the request is
 * waiting on, through the same Chat or email path as the daily job's
 * reminders, at most once a day per request, and a line in its history.
 */
export async function sendReminder(form: FormData) {
  const viewer = await requireViewer();
  if (!mayOpenStuck(viewer.roles)) back(form, { error: "Only the IAR office, executives and portal admins can send reminders from this page." });
  const id = String(form.get("id") ?? "");
  const store = await cardStore();
  const card = await store.get(id);
  const now = new Date().toISOString();
  const [item] = card ? stuckItems([card], now, await needsContext()) : [];
  if (!card || !item) back(form, { error: `${id || "That request"} isn't waiting on anyone any more.` });
  if (!canRemind(item, now)) back(form, { error: `A reminder for ${id} already went out today. You can send another tomorrow.` });

  const names = await nameResolver(item.holder.to.flatMap((r) => ("email" in r ? [r.email] : [])));
  try {
    // updatedAt stays, so this can't clash with someone working on the request; a save that does is a real change.
    await store.save(withReminder(card, viewer.email, now, whoWaiting(item.holder.to, names)), card.updatedAt);
  } catch (err) {
    if (err instanceof ConflictError) back(form, { error: `${id} changed a moment ago. Have a look at it again before reminding anyone.` });
    throw err;
  }
  await deliver(reminderNotices(item, { email: viewer.email, name: viewer.name }), viewer.email, now);
  revalidatePath("/stuck");
  back(form, { sent: id });
}
