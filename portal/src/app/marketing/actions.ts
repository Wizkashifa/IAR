"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cardStore, ConflictError } from "@/lib/cards";
import { requireViewer, type Viewer } from "@/lib/viewer";
import { deliver } from "@/lib/notifications";
import { actorFor } from "@/lib/people";
import { directory, queueTeamMembers } from "@/lib/groups";
import { todayLocal } from "@/lib/dates";
import { MARKETING_TYPES, isMarketingKind, parseMarketingInput, type MarketingInput } from "@/lib/marketing/forms";
import { marketingCommentNotices, marketingNotices } from "@/lib/marketing/notices";
import * as wf from "@/lib/marketing/workflow";
import { filesFrom } from "@/lib/drive";
import { asksForFiles, checkFiles, filesOf } from "@/lib/marketing/files";
import { NOT_SET_UP, marketingFolder, saveMarketingFiles } from "@/lib/marketing/drive";
import { WorkflowError } from "@/lib/workflow-core";
import { actOnCard, commentOnCard, unknownAction } from "@/lib/card-actions";
import { isEventCard, type EventCard } from "@/lib/events/workflow";
import { mayAddPiece, newPiece, pieceAddedNotices } from "@/lib/marketing/linked";
import type { FormState } from "@/components/FormErrors";

/** `n` changes on every answer, so the form redraws with what was typed. */
export type MarketingFormState = FormState & { values?: MarketingInput; n: number };

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

export async function createMarketing(prev: MarketingFormState, form: FormData): Promise<MarketingFormState> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const raw = inputFrom(form);
  const store = await cardStore();
  // A piece of marketing for an event: added from the event's page, by someone who may add one now. Its committee is the event's.
  const eventId = String(form.get("event") ?? "");
  let event: EventCard | null = null;
  if (raw.kind === "event" || eventId) {
    const found = eventId ? await store.get(eventId) : null;
    if (!isEventCard(found)) return { errors: ["Add marketing for an event from the event's page."], values: raw, n: prev.n + 1 };
    const may = mayAddPiece(found, actor);
    if (!may.ok) return { errors: [may.reason], values: raw, n: prev.n + 1 };
    event = found;
    raw.kind = "event";
    raw.committee = found.event.committeeName;
  }
  const parsed = parseMarketingInput(raw, { today: todayLocal(), committees: event ? [event.event.committeeName] : await committeesFor(viewer) });
  const files = isMarketingKind(raw.kind) && asksForFiles(raw.kind) ? filesFrom(form, "files") : [];
  const fileErrors = files.length === 0 ? [] : (await marketingFolder()) ? checkFiles(files) : [NOT_SET_UP];
  if (!parsed.ok || fileErrors.length) return { errors: [...(parsed.ok ? [] : parsed.errors), ...fileErrors], values: raw, n: prev.n + 1 };

  const now = nowIso();
  const { id: _blank, ...toCreate } = event ? newPiece(event, parsed.details, actor, now) : wf.newMarketing(parsed.details, actor, now);
  const created = (await store.create(toCreate, "MK")) as wf.MarketingCard;
  await deliver([...marketingNotices(null, created, actor), ...pieceAddedNotices(created, actor)], actor.email);
  if (event) revalidatePath(`/events/${event.id}`);
  if (files.length) {
    try {
      const saved = await saveMarketingFiles({ id: created.id, kind: created.marketing.kind, sentAt: created.createdAt ?? created.updatedAt }, files);
      await store.save(wf.addFiles(created, actor, nowIso(), saved), created.updatedAt);
    } catch (err) {
      console.error("marketing file upload failed", err);
      revalidatePath("/marketing");
      redirect(`/marketing/${created.id}?sent=1&error=${encodeURIComponent("Your request was sent, but the files didn't upload. Try adding them again below, or share a Google Drive link.")}`);
    }
  }
  revalidatePath("/marketing");
  redirect(`/marketing/${created.id}?sent=1`);
}

/** Files added from the request page, by the requester or the marketing team. Never changes the stage. */
export async function addMarketingFiles(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const id = String(form.get("id") ?? "");
  const store = await cardStore();
  const card = await store.get(id);
  if (!wf.isMarketingCard(card)) redirect("/marketing");
  const back = (q: string) => {
    revalidatePath(`/marketing/${id}`);
    redirect(`/marketing/${id}?${q}#files`);
  };
  const allowed = wf.permission(card, actor, "files");
  if (!allowed.ok) back(`error=${encodeURIComponent(allowed.reason)}`);
  const files = filesFrom(form, "files");
  if (files.length === 0) back(`error=${encodeURIComponent("Choose a file first.")}`);
  const problems = (await marketingFolder()) ? checkFiles(files, filesOf(card.marketing).length) : [NOT_SET_UP];
  if (problems.length) back(`error=${encodeURIComponent(problems.join(" "))}`);

  let error: string | null = null;
  try {
    const saved = await saveMarketingFiles({ id: card.id, kind: card.marketing.kind, sentAt: card.createdAt ?? card.marketing.history[0]?.at ?? card.updatedAt }, files);
    // Someone may have saved the request while the files uploaded: add them to the latest copy.
    for (let attempt = 0; attempt < 2; attempt++) {
      const latest = attempt === 0 ? card : await store.get(id);
      if (!wf.isMarketingCard(latest)) break;
      try {
        await store.save(wf.addFiles(latest, actor, nowIso(), saved), latest.updatedAt);
        break;
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt === 1) throw err;
      }
    }
  } catch (err) {
    if (err instanceof WorkflowError) error = err.message;
    else {
      console.error("marketing file upload failed", err);
      error = "The files didn't upload. Try again, or share a Google Drive link.";
    }
  }
  revalidatePath("/marketing");
  back(error ? `error=${encodeURIComponent(error)}` : "ok=files");
}

/**
 * The requester's edit page: saves changes, and when marketing asked a
 * question, sends the answer with them (back to the team as new).
 */
export async function editMarketing(id: string, expected: string, prev: MarketingFormState, form: FormData): Promise<MarketingFormState> {
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

  // A request keeps its committee even if the person has since left it; a piece for an event keeps the event's.
  if (card.marketing.eventCardId) raw.committee = card.committee;
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
    if (err instanceof WorkflowError || err instanceof ConflictError) return fail([err.message]);
    console.error("marketing edit failed", err);
    return fail(["Something went wrong saving the request. Nothing was changed."]);
  }
  revalidatePath("/marketing");
  redirect(`/marketing/${id}?ok=${answering ? "answer" : "edit"}`);
}

const marketing = { path: "/marketing", is: wf.isMarketingCard };

/** Schedule, ask, decline, start, hand to someone, change the date, finish, answer or cancel. */
export async function actOnMarketing(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  const note = String(form.get("note") ?? "").slice(0, 2000);
  const doneBy = String(form.get("doneBy") ?? "");
  await actOnCard(form, viewer, {
    ...marketing,
    async act(card, action, now) {
      let next: wf.MarketingCard;
      switch (action as wf.Action) {
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
        case "assign":
          next = wf.assign(card, actor, now, String(form.get("assignee") ?? ""), await queueTeamMembers("marketing"));
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
          return unknownAction();
      }
      return { next, notices: marketingNotices(card, next, actor) };
    },
  });
}

export async function commentOnMarketing(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = await actorFor(viewer);
  await commentOnCard(form, viewer, { ...marketing, notices: (card, text) => marketingCommentNotices(card, actor, text) });
}
