"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { internalPath } from "@/lib/links";
import { markRead } from "@/lib/notifications";
import { requireViewer } from "@/lib/viewer";

/** Open one notification: mark it read, then go where it points. */
export async function openNotification(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const id = String(form.get("id") ?? "");
  const href = String(form.get("href") ?? "/");
  if (id) await markRead(viewer, [id]);
  // Only ever follow links inside the portal.
  redirect(internalPath(href) ?? "/notifications");
}

export async function markAllRead(): Promise<void> {
  const viewer = await requireViewer();
  await markRead(viewer, "all");
  revalidatePath("/", "layout");
  redirect("/notifications");
}
