"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cardStore } from "@/lib/cards";
import { deleteCard, mayDeleteRequests } from "@/lib/card-delete";
import { kindOf } from "@/lib/kinds";
import { requireViewer } from "@/lib/viewer";

/** A portal admin deletes a request for good, from its page. */
export async function deleteRequest(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const id = String(form.get("id") ?? "");
  const card = await (await cardStore()).get(id);
  const path = card ? (kindOf(card.type)?.path ?? "/requests") : "/requests";
  if (!card) redirect("/requests");
  if (!mayDeleteRequests(viewer)) redirect(`${path}/${id}?error=${encodeURIComponent("Only portal admins can delete a request.")}`);
  let problems: string[];
  try {
    problems = await deleteCard(card, viewer);
  } catch (err) {
    console.error("deleting a request failed", err);
    redirect(`${path}/${id}?error=${encodeURIComponent("Something went wrong deleting the request. Try again.")}`);
  }
  revalidatePath(path);
  revalidatePath("/requests");
  const q = new URLSearchParams({ deleted: id, ...(problems.length ? { problem: problems.join(" ") } : {}) });
  redirect(`/requests?${q}`);
}
