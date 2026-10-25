"use server";
import { redirect } from "next/navigation";
import { cleanPrefs } from "@/lib/notify-prefs";
import { peopleStore } from "@/lib/people";
import { requireViewer } from "@/lib/viewer";

/** Save the person's own notification choices. Anything unexpected falls back to the defaults. */
export async function saveNotificationSettings(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const prefs = cleanPrefs(viewer.email, { fyi: String(form.get("fyi") ?? ""), quiet: form.get("quiet") === "on" });
  await (await peopleStore()).setPrefs({ ...prefs, updatedAt: new Date().toISOString() });
  redirect("/notifications/settings?saved=1");
}
