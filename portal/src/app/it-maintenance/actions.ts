"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { todayLocal } from "@/lib/dates";
import { cardStore, ConflictError, type CardStatus } from "@/lib/cards";
import { filesFrom } from "@/lib/drive";
import { deliver } from "@/lib/notifications";
import { ORG } from "@/lib/org";
import type { Notice } from "@/lib/notices";
import { requireViewer } from "@/lib/viewer";
import { canViewTicket } from "@/lib/tickets/access";
import { teamMembers, ticketActor } from "@/lib/tickets/context";
import { checkPhotos, parseTicketInput } from "@/lib/tickets/input";
import { type JiraPlan, planCounts, planJiraImport } from "@/lib/tickets/jira";
import { ticketCommentNotices, ticketNotices } from "@/lib/tickets/notices";
import { savePhotos } from "@/lib/tickets/photos";
import { scheduleStore } from "@/lib/tickets/schedule-store";
import { canManageSchedules, parseScheduleInput } from "@/lib/tickets/schedules";
import type { TicketStatus, TicketTeam, Urgency } from "@/lib/tickets/types";
import * as wf from "@/lib/tickets/workflow";
import { WorkflowError } from "@/lib/workflow-core";
import { actOnCard, commentOnCard, unknownAction } from "@/lib/card-actions";

export type TicketFormState = { errors: string[] };

const nowIso = () => new Date().toISOString();
const back = (id: string, q: string) => `/it-maintenance/${id}?${q}`;
const err = (msg: string) => `error=${encodeURIComponent(msg)}`;
const field = (form: FormData, name: string) => String(form.get(name) ?? "");

/** A new AV/IT/Maintenance request. Photos upload after the ticket has its number; if they fail, the ticket still stands. */
export async function createTicket(_prev: TicketFormState, form: FormData): Promise<TicketFormState> {
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const parsed = parseTicketInput(Object.fromEntries(["team", "title", "room", "roomOther", "equipment", "urgency", "description"].map((k) => [k, form.get(k)])));
  const photos = filesFrom(form, "photos");
  const errors = [...(parsed.ok ? [] : parsed.errors), ...checkPhotos(photos)];
  if (!parsed.ok || errors.length) return { errors };

  const store = await cardStore();
  const now = nowIso();
  const { id: _blank, ...draft } = wf.newTicket(parsed.input, { email: viewer.email, name: viewer.name }, now);
  const created = (await store.create(draft, "TK")) as wf.TicketCard;
  await deliver(ticketNotices(null, created, actor), actor.email);

  if (photos.length) {
    try {
      const saved = await savePhotos(created.id, photos, actor.email);
      await store.save(wf.addPhotos(created, actor, nowIso(), saved), created.updatedAt);
    } catch (e) {
      console.error("ticket photo upload failed", e);
      redirect(back(created.id, err("Your request was sent, but the photos didn't upload. Try adding them again below.")));
    }
  }
  revalidatePath("/it-maintenance");
  redirect(back(created.id, "sent=1"));
}

const tickets = { path: "/it-maintenance", is: wf.isTicketCard, noun: "ticket" };

/** Assign, start, wait on parts, resolve, set a target date, confirm, reopen or cancel. */
export async function actOnTicket(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const note = field(form, "note").slice(0, 2000);
  await actOnCard(form, viewer, {
    ...tickets,
    async act(card, action, now) {
      let next: wf.TicketCard;
      switch (action as wf.Action) {
        case "assign":
          next = wf.assign(card, actor, now, field(form, "assignee"), (await teamMembers())[card.ticket.team]);
          break;
        case "start":
          next = wf.start(card, actor, now);
          break;
        case "wait":
          next = wf.waitForParts(card, actor, now, note);
          break;
        case "resolve":
          next = wf.resolve(card, actor, now, note);
          break;
        case "due":
          next = wf.setDueDate(card, actor, now, field(form, "due"));
          break;
        case "confirm":
          next = wf.confirm(card, actor, now);
          break;
        case "reopen":
          next = wf.reopen(card, actor, now, note);
          break;
        case "cancel":
          next = wf.cancel(card, actor, now);
          break;
        default:
          return unknownAction();
      }
      return { next, notices: ticketNotices(card, next, actor) };
    },
  });
}

// ---- My work today --------------------------------------------------------------

const TODAY_PAGE = "/it-maintenance/today";
const QUICK: wf.Action[] = ["assign", "start", "wait", "resolve"];

/**
 * One tap from "My work today": take it, start, waiting on parts, or mark fixed
 * (with what was done and, optionally, a photo). Back to the same list.
 */
export async function actFromToday(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const id = field(form, "id");
  const action = field(form, "action") as wf.Action;
  const note = field(form, "note").slice(0, 2000);
  const photos = filesFrom(form, "photos");
  const store = await cardStore();
  const card = await store.get(id);
  const toList = (q: string) => `${TODAY_PAGE}?${q}#${id}`;
  if (!wf.isTicketCard(card) || !QUICK.includes(action) || !canViewTicket(card, { ...actor, seeAll: false })) redirect(TODAY_PAGE);
  if (field(form, "expected") !== card.updatedAt) redirect(toList(err(`${id} changed while you were looking at it. Check it again.`)));

  const now = nowIso();
  let error: string | null = checkPhotos(photos)[0] ?? null;
  if (!error) {
    try {
      let next: wf.TicketCard;
      if (action === "assign") next = wf.assign(card, actor, now, actor.email, (await teamMembers())[card.ticket.team]);
      else if (action === "start") next = wf.start(card, actor, now);
      else if (action === "wait") next = wf.waitForParts(card, actor, now, note);
      else next = wf.resolve(card, actor, now, note);
      await store.save(next, card.updatedAt);
      await deliver(ticketNotices(card, next, actor), actor.email);
      if (photos.length) {
        try {
          const saved = await savePhotos(card.id, photos, actor.email);
          const fresh = await store.get(id);
          if (wf.isTicketCard(fresh)) await store.save(wf.addPhotos(fresh, actor, nowIso(), saved), fresh.updatedAt);
        } catch (e) {
          console.error("ticket photo upload failed", e);
          error = `${id} was updated, but the photo didn't upload. Add it on the ticket page.`;
        }
      }
    } catch (e) {
      if (e instanceof WorkflowError || e instanceof ConflictError) error = e.message;
      else {
        console.error("ticket action failed", e);
        error = "Something went wrong. Nothing was changed.";
      }
    }
  }
  revalidatePath(TODAY_PAGE);
  revalidatePath("/it-maintenance");
  revalidatePath(`/it-maintenance/${id}`);
  redirect(toList(error ? err(error) : `ok=${action}`));
}

// ---- Linked tickets --------------------------------------------------------------

/** Link this ticket to another by its number ("TK-1003" or "1003"), or remove a link (`unlink`). Both tickets change. */
export async function linkTicket(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const id = field(form, "id");
  const unlink = field(form, "unlink");
  const raw = field(form, "other").trim().toUpperCase();
  const otherId = unlink || (/^\d+$/.test(raw) ? `TK-${raw}` : raw);
  const store = await cardStore();
  const card = await store.get(id);
  if (!wf.isTicketCard(card) || !canViewTicket(card, { ...actor, seeAll: viewer.roles.includes("admins") })) redirect("/it-maintenance");
  let error: string | null = null;
  try {
    if (!otherId) throw new WorkflowError("Type the other ticket's number, like TK-1003.");
    const other = await store.get(otherId);
    // A ticket this person can't open looks the same as one that doesn't exist.
    const otherTicket = wf.isTicketCard(other) && canViewTicket(other, { ...actor, seeAll: viewer.roles.includes("admins") }) ? other : null;
    const now = nowIso();
    if (unlink) {
      const [a, b] = wf.unlinkTickets(card, otherTicket, otherId, actor, now);
      await store.save(a, card.updatedAt);
      if (b && otherTicket) await store.save(b, otherTicket.updatedAt);
    } else {
      if (!otherTicket) throw new WorkflowError(`There's no ticket ${otherId}.`);
      const kind = field(form, "kind") as Parameters<typeof wf.linkTickets>[4];
      const [a, b] = wf.linkTickets(card, otherTicket, actor, now, kind);
      await store.save(a, card.updatedAt);
      await store.save(b, otherTicket.updatedAt);
    }
  } catch (e) {
    if (e instanceof WorkflowError || e instanceof ConflictError) error = e.message;
    else {
      console.error("ticket link failed", e);
      error = "Something went wrong. Nothing was changed.";
    }
  }
  revalidatePath(`/it-maintenance/${id}`);
  if (otherId) revalidatePath(`/it-maintenance/${otherId}`);
  redirect(back(id, error ? err(error) : unlink ? "ok=unlinked" : "ok=linked"));
}

/** For forms with several submit buttons: each button binds its own action. */
export async function actOnTicketWith(action: wf.Action, form: FormData): Promise<void> {
  form.set("action", action);
  return actOnTicket(form);
}

export async function addTicketPhotos(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const id = field(form, "id");
  const store = await cardStore();
  const card = await store.get(id);
  if (!wf.isTicketCard(card) || !canViewTicket(card, { ...actor, seeAll: viewer.roles.includes("admins") })) redirect("/it-maintenance");
  const files = filesFrom(form, "photos");
  const problems = checkPhotos(files);
  const allowed = wf.permission(card, actor, "photos");
  let error = problems[0] ?? (files.length === 0 ? "Choose a photo first." : allowed.ok ? null : allowed.reason);
  if (!error) {
    try {
      const saved = await savePhotos(card.id, files, actor.email);
      const fresh = await store.get(id);
      if (!wf.isTicketCard(fresh)) throw new WorkflowError("That ticket no longer exists.");
      await store.save(wf.addPhotos(fresh, actor, nowIso(), saved), fresh.updatedAt);
    } catch (e) {
      if (e instanceof WorkflowError || e instanceof ConflictError) error = e.message;
      else {
        console.error("ticket photo upload failed", e);
        error = "The photos didn't upload. Try again.";
      }
    }
  }
  revalidatePath(`/it-maintenance/${id}`);
  redirect(back(id, error ? err(error) : "ok=photos"));
}

/** Follow or stop following a ticket. */
export async function watchTicket(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const id = field(form, "id");
  const on = field(form, "on") === "1";
  const store = await cardStore();
  let error: string | null = null;
  // Retry once if someone saved at the same moment: following never needs to wait.
  for (let attempt = 0; attempt < 2; attempt++) {
    const card = await store.get(id);
    if (!wf.isTicketCard(card) || !canViewTicket(card, { ...actor, seeAll: viewer.roles.includes("admins") })) redirect("/it-maintenance");
    try {
      await store.save(wf.setWatching(card, actor.email, on, nowIso()), card.updatedAt);
      error = null;
      break;
    } catch (e) {
      if (e instanceof WorkflowError) {
        error = e.message;
        break;
      }
      if (!(e instanceof ConflictError) || attempt === 1) {
        if (!(e instanceof ConflictError)) console.error("watch failed", e);
        error = "That didn't save. Try again.";
      }
    }
  }
  revalidatePath(`/it-maintenance/${id}`);
  redirect(back(id, error ? err(error) : on ? "ok=watch" : "ok=unwatch"));
}

/** A comment from anyone who can open the ticket. Never changes its status. */
export async function commentOnTicket(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  await commentOnCard(form, viewer, {
    ...tickets,
    after: (card, now) => wf.afterComment(card, actor, now),
    notices: (card, text) => ticketCommentNotices(card, actor, text),
  });
}

// ---- Preventive schedules ------------------------------------------------------

const SCHEDULES = "/it-maintenance/schedules";

/** Add a schedule, or save changes to one (`id`). */
export async function saveSchedule(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const id = field(form, "id");
  const store = await scheduleStore();
  const existing = id ? await store.get(id) : null;
  if (id && !existing) redirect(`${SCHEDULES}?${err("That schedule no longer exists.")}`);
  if (existing && !canManageSchedules(actor, existing.team)) redirect(`${SCHEDULES}?${err("Only the team that owns this schedule can change it.")}`);
  const raw = Object.fromEntries(["team", "name", "frequency", "next", "room", "equipment", "description", "urgency", "assignee"].map((k) => [k, form.get(k)]));
  const parsed = parseScheduleInput(raw, { today: todayLocal(), members: await teamMembers(), isNew: !existing });
  if (!parsed.ok) redirect(`${SCHEDULES}?${id ? `edit=${id}&` : "new=1&"}${err(parsed.errors.join(" "))}`);
  if (!canManageSchedules(actor, parsed.value.team)) redirect(`${SCHEDULES}?${err("You can only add schedules for your own team.")}`);
  const now = nowIso();
  if (existing) await store.save({ ...existing, ...parsed.value, updatedAt: now });
  else await store.create({ ...parsed.value, paused: false, createdBy: actor.email, createdAt: now, updatedAt: now });
  revalidatePath(SCHEDULES);
  redirect(`${SCHEDULES}?ok=${existing ? "updated" : "added"}`);
}

export async function pauseSchedule(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const store = await scheduleStore();
  const s = await store.get(field(form, "id"));
  if (!s || !canManageSchedules(actor, s.team)) redirect(`${SCHEDULES}?${err("Only the team that owns this schedule can change it.")}`);
  const paused = field(form, "paused") === "1";
  await store.save({ ...s, paused, updatedAt: nowIso() });
  revalidatePath(SCHEDULES);
  redirect(`${SCHEDULES}?ok=${paused ? "paused" : "resumed"}`);
}

// ---- Jira import -----------------------------------------------------------------

const ALL_TICKET_STATUSES: CardStatus[] = ["submitted", "in_review", "close_out", "closed", "cancelled"];
const CSV_MAX_BYTES = 5 * 1024 * 1024;

type Row = { key: string; title: string; team: TicketTeam; status: TicketStatus; urgency: Urgency; room: string; assignee?: string };

export type ImportState = {
  stage: "start" | "preview" | "done";
  error?: string;
  /** The file's text, posted back to import exactly what was previewed. */
  csv?: string;
  includeDone?: boolean;
  preview?: {
    ready: Row[];
    counts: ReturnType<typeof planCounts>;
    alreadyImported: JiraPlan["alreadyImported"];
    skippedDone: JiraPlan["skippedDone"];
    problems: JiraPlan["problems"];
    unmatchedPeople: string[];
  };
  created?: { id: string; key: string; title: string }[];
  /** Keys someone else imported between the preview and the import. */
  alreadyThere?: number;
  failed?: number;
};

async function plan(text: string, includeDone: boolean, importer: { email: string; name: string }) {
  const store = await cardStore();
  const existing = (await store.listByType("ticket", ALL_TICKET_STATUSES, 5000)).filter(wf.isTicketCard);
  const existingKeys = new Set(existing.map((c) => c.ticket.jiraKey).filter((k): k is string => Boolean(k)));
  return planJiraImport(text, { domain: ORG.domain, importer, members: await teamMembers(), existingKeys, includeDone, now: nowIso() });
}

/** Step 1 ("preview"): read the file and show what would happen. Step 2 ("import"): create the tickets. */
export async function jiraImport(prev: ImportState, form: FormData): Promise<ImportState> {
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  if (!wf.canImportJira(actor)) return { stage: "start", error: "Only portal admins and the facilities team's chairs can import from Jira." };
  const importer = { email: actor.email, name: viewer.name };
  const includeDone = form.get("includeDone") === "on" || form.get("includeDone") === "1";

  if (field(form, "step") === "import") {
    const csv = field(form, "csv");
    const r = await plan(csv, includeDone, importer);
    if (!r.ok) return { stage: "start", error: r.error };
    const store = await cardStore();
    const created: ImportState["created"] = [];
    let failed = 0;
    const assigned = new Map<string, string[]>();
    for (const p of r.plan.ready) {
      try {
        const { id: _blank, ...card } = p.card;
        const c = await store.create(card, "TK");
        created.push({ id: c.id, key: p.key, title: c.title });
        const a = p.card.ticket.assigneeEmail;
        if (a && wf.withTeam(p.card.ticket)) assigned.set(a, [...(assigned.get(a) ?? []), c.id]);
      } catch (e) {
        console.error(`Jira import failed for ${p.key}`, e);
        failed++;
      }
    }
    // One quiet notice per assignee rather than an alert per ticket.
    const notices: Notice[] = [...assigned.entries()].map(([email, ids]) => ({
      to: { email },
      href: "/it-maintenance?f=mine",
      text: `${ids.length} ticket${ids.length === 1 ? "" : "s"} brought over from Jira ${ids.length === 1 ? "is" : "are"} assigned to you (${ids.slice(0, 5).join(", ")}${ids.length > 5 ? "…" : ""}).`,
      alert: false,
      delegable: false,
    }));
    await deliver(notices, actor.email);
    revalidatePath("/it-maintenance");
    return { stage: "done", created, alreadyThere: r.plan.alreadyImported.length - (prev.preview?.alreadyImported.length ?? 0), failed };
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { stage: "start", error: "Choose the CSV file you exported from Jira." };
  if (file.size > CSV_MAX_BYTES) return { stage: "start", error: "That file is over 5 MB. Export only the open issues, or split it." };
  if (!/\.csv$/i.test(file.name)) return { stage: "start", error: "Choose a .csv file (in Jira: Export → Export CSV)." };
  const csv = await file.text();
  const r = await plan(csv, includeDone, importer);
  if (!r.ok) return { stage: "start", error: r.error };
  const p = r.plan;
  return {
    stage: "preview",
    csv,
    includeDone,
    preview: {
      ready: p.ready.map((x) => ({ key: x.key, title: x.card.title, team: x.card.ticket.team, status: x.card.ticket.status, urgency: x.card.ticket.urgency, room: x.card.ticket.room, assignee: x.card.ticket.assigneeEmail })),
      counts: planCounts(p),
      alreadyImported: p.alreadyImported,
      skippedDone: p.skippedDone,
      problems: p.problems,
      unmatchedPeople: p.unmatchedPeople,
    },
  };
}
