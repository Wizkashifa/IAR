"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cardStore, ConflictError } from "@/lib/cards";
import { requireViewer, type Viewer } from "@/lib/viewer";
import { deliver } from "@/lib/notifications";
import { actorFor } from "@/lib/people";
import { directory } from "@/lib/groups";
import { todayLocal } from "@/lib/away";
import { checkComment, withComment } from "@/lib/comments";
import { MARKETING_TYPES, isMarketingKind, parseMarketingInput, type MarketingInput } from "@/lib/marketing/forms";
import { canViewMarketing } from "@/lib/marketing/access";
import { marketingCommentNotices, marketingNotices } from "@/lib/marketing/notices";
import * as wf from "@/lib/marketing/workflow";

/** `n` changes on every answer, so the form redraws with what was typed. */
export type FormState = { errors: string[]; values?: MarketingInput; n: number };

const nowIso = () => new Date().toISOString();

/**
 * Committees and teams this person may request for: the ones they're on and
 * the ones they direct. The office and portal admins may pick any team.
 */
export async function committeesFor(viewer: Viewer): Promise<string[]> {
  const dir = await directory();
  if (viewer.roles.includes("office") || viewer.roles.includes("admins")) return dir.teams.map((t) => t.name).sort((a, b) => a.localeCompare(b));
  const directed = dir.teams.filter((t) => viewer.directs.includes(t.email.toLowerCase())).map((t) => t.name);
  return [...new Set([...viewer.teams.map((t) => t.name), ...directed])].sort((a, b) => a.localeCompare(b));
}

/** The form's fields: `a_<key>` for each of the type's questions. */
function inputFrom(form: FormData): MarketingInput {
  const kind = String(form.get("kind") ?? "");
  const answers: Record<string, string> = {};
  if (isMarketingKind(kind)) for (const f of MARKETING_TYPES[kind].fields) answers[f.key] = String(form.get(`a_${f.key}`) ?? "");
  return {
    kind,
    answers,
    committee: String(form.get("committee") ?? ""),
    driveLink: String(form.get("driveLink") ?? ""),
    notes: String(form.get("notes") ?? ""),
  };
}

export async function createMarketing(prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const raw = inputFrom(form);
  const parsed = parseMarketingInput(raw, { today: todayLocal(), committees: await committeesFor(viewer) });
  if (!parsed.ok) return { errors: parsed.errors, values: raw, n: prev.n + 1 };

  const store = await cardStore();
  const { id: _blank, ...toCreate } = wf.newMarketing(parsed.details, actor, nowIso());
  const created = (await store.create(toCreate, "MK")) as wf.MarketingCard;
  await deliver(marketingNotices(null, created, actor), actor.email);
  revalidatePath("/marketing");
  redirect(`/marketing/${created.id}?sent=1`);
}

/**
 * The requester's edit page: saves changes, and when marketing asked a
 * question, sends the answer with them (back to the weekly review).
 */
export async function editMarketing(id: string, expected: string, prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const store = await cardStore();
  const card = await store.get(id);
  if (!wf.isMarketingCard(card)) return { errors: ["That request no longer exists."], n: prev.n + 1 };
  const raw = { ...inputFrom(form), kind: card.marketing.kind };
  const fail = (errors: string[]) => ({ errors, values: raw, n: prev.n + 1 });
  if (card.updatedAt !== expected) return fail(["This request changed while you were editing it. Open it again to see what changed."]);
  const answering = card.marketing.stage === "question";
  const allowed = wf.permission(card, actor, answering ? "answer" : "edit");
  if (!allowed.ok) return fail([allowed.reason]);

  // A request keeps its committee even if the person has since left it.
  const committees = [...new Set([...(await committeesFor(viewer)), card.committee])];
  const parsed = parseMarketingInput(raw, { today: todayLocal(), committees });
  const answer = String(form.get("answer") ?? "").slice(0, 2000);
  if (!parsed.ok) return fail(parsed.errors);
  if (answering && !answer.trim()) return fail(["Write your answer to marketing's question."]);
  try {
    const now = nowIso();
    const next = answering ? wf.answer(card, actor, now, answer, parsed.details) : wf.edit(card, actor, now, parsed.details);
    await store.save(next, card.updatedAt);
    await deliver(marketingNotices(card, next, actor), actor.email);
  } catch (err) {
    if (err instanceof wf.WorkflowError || err instanceof ConflictError) return fail([err.message]);
    console.error("marketing edit failed", err);
    return fail(["Something went wrong saving the request. Nothing was changed."]);
  }
  revalidatePath("/marketing");
  redirect(`/marketing/${id}?ok=${answering ? "answer" : "edit"}`);
}

/** Schedule, ask, decline, start, change the date, finish, answer or cancel. */
export async function actOnMarketing(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const id = String(form.get("id") ?? "");
  const action = String(form.get("action") ?? "") as wf.Action;
  const note = String(form.get("note") ?? "").slice(0, 2000);
  const doneBy = String(form.get("doneBy") ?? "");
  const store = await cardStore();
  const card = await store.get(id);
  if (!wf.isMarketingCard(card)) redirect("/marketing");
  if (String(form.get("expected") ?? "") !== card.updatedAt) {
    redirect(`/marketing/${id}?error=${encodeURIComponent("This request changed while you were looking at it. Check it again before acting.")}`);
  }

  const now = nowIso();
  let error: string | null = null;
  try {
    let next: wf.MarketingCard;
    switch (action) {
      case "schedule":
        next = wf.schedule(card, actor, now, doneBy, note);
        break;
      case "ask":
        next = wf.ask(card, actor, now, note);
        break;
      case "decline":
        next = wf.decline(card, actor, now, note);
        break;
      case "start":
        next = wf.start(card, actor, now, note);
        break;
      case "reschedule":
        next = wf.reschedule(card, actor, now, doneBy, note);
        break;
      case "finish":
        next = wf.finish(card, actor, now, note);
        break;
      case "answer":
        next = wf.answer(card, actor, now, note);
        break;
      case "cancel":
        next = wf.cancel(card, actor, now);
        break;
      default:
        throw new wf.WorkflowError("Unknown action.");
    }
    await store.save(next, card.updatedAt);
    await deliver(marketingNotices(card, next, actor), actor.email);
  } catch (err) {
    if (err instanceof wf.WorkflowError || err instanceof ConflictError) error = err.message;
    else {
      console.error("marketing action failed", err);
      error = "Something went wrong. Nothing was changed.";
    }
  }
  revalidatePath("/marketing");
  revalidatePath(`/marketing/${id}`);
  redirect(error ? `/marketing/${id}?error=${encodeURIComponent(error)}` : `/marketing/${id}?ok=${action}`);
}

/** A comment from anyone who can open the request. Never changes its stage. */
export async function commentOnMarketing(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const id = String(form.get("id") ?? "");
  const store = await cardStore();
  const check = checkComment(form.get("text"));
  let error: string | null = check.ok ? null : check.error;
  if (check.ok) {
    // Retry once if someone else saved the request at the same moment: a comment never needs to wait.
    for (let attempt = 0; attempt < 2; attempt++) {
      const card = await store.get(id);
      if (!wf.isMarketingCard(card) || !canViewMarketing(card, { ...actor, seeAll: viewer.roles.includes("admins") })) redirect("/marketing");
      const next = withComment(card, { at: nowIso(), by: actor.email, name: viewer.name, text: check.text });
      try {
        await store.save(next, card.updatedAt);
        await deliver(marketingCommentNotices(next, actor, check.text), actor.email);
        error = null;
        break;
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt === 1) {
          if (!(err instanceof ConflictError)) console.error("comment failed", err);
          error = "Your comment couldn't be saved. Try again.";
        }
      }
    }
  }
  revalidatePath(`/marketing/${id}`);
  redirect(error ? `/marketing/${id}?error=${encodeURIComponent(error)}#comments` : `/marketing/${id}?ok=commented#comments`);
}
