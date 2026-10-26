"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkComment } from "@/lib/comments";
import { FEEDBACK_KIND_LABEL, feedbackStore, type FeedbackKind } from "@/lib/feedback";
import { mayOpenFeedback, replyNotices } from "@/lib/feedback-thread";
import { internalPath } from "@/lib/links";
import { deliver } from "@/lib/notifications";
import { requireViewer } from "@/lib/viewer";
import type { FormState } from "@/components/FormErrors";


export async function sendFeedback(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const kind = String(form.get("kind") ?? "") as FeedbackKind;
  const message = String(form.get("message") ?? "").trim();
  const page = internalPath(String(form.get("page") ?? "/")) ?? "/";
  const errors: string[] = [];
  if (!(kind in FEEDBACK_KIND_LABEL)) errors.push("Choose what kind of feedback this is.");
  if (!message) errors.push("Tell us what happened or what you'd like.");
  if (message.length > 4000) errors.push("Keep it under 4,000 characters.");
  if (errors.length) return { errors };

  const saved = await (await feedbackStore()).add({
    at: new Date().toISOString(),
    by: viewer.email.toLowerCase(),
    name: viewer.name,
    kind,
    message,
    page,
    userAgent: ((await headers()).get("user-agent") ?? "").slice(0, 300) || undefined,
    status: "new",
  });
  const preview = message.length > 140 ? `${message.slice(0, 140)}…` : message;
  await deliver(
    [{ to: { role: "admins" }, href: `/feedback/${saved.id}`, text: `Portal feedback (${FEEDBACK_KIND_LABEL[kind].toLowerCase()}) from ${viewer.name} on ${page}: ${preview}`, alert: true, delegable: false, cardId: saved.id }],
    viewer.email,
  );
  redirect(`/feedback?ok=1&from=${encodeURIComponent(page)}`);
}

export async function setFeedbackStatus(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  if (!viewer.roles.includes("admins")) redirect("/feedback");
  const id = String(form.get("id") ?? "");
  const status = form.get("status") === "done" ? "done" : "new";
  if (id) await (await feedbackStore()).setStatus(id, status, viewer.email.toLowerCase());
  revalidatePath("/feedback");
  // From the feedback's own page, go back to it.
  redirect(form.get("back") === "item" && id ? `/feedback/${encodeURIComponent(id)}?ok=${status}` : "/feedback");
}

/** A reply on a piece of feedback, from a portal admin or the person who sent it. */
export async function replyToFeedback(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const id = String(form.get("id") ?? "");
  const store = await feedbackStore();
  const f = id ? await store.get(id) : null;
  if (!f || !mayOpenFeedback(f, viewer)) redirect("/feedback");
  const page = `/feedback/${encodeURIComponent(f.id)}`;
  const check = checkComment(form.get("text"));
  if (!check.ok) redirect(`${page}?error=${encodeURIComponent(check.error)}`);
  const by = viewer.email.toLowerCase();
  const reopen = f.status === "done" && !viewer.roles.includes("admins");
  await store.addReply(f.id, { id: `r${(f.replies?.length ?? 0) + 1}-${Date.now().toString(36)}`, at: new Date().toISOString(), by, name: viewer.name, text: check.text }, reopen);
  await deliver(replyNotices(f, viewer, check.text), by);
  revalidatePath(page);
  redirect(`${page}?ok=replied#comments`);
}
