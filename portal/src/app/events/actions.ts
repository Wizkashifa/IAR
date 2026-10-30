"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cardStore, ConflictError } from "@/lib/cards";
import { deliver } from "@/lib/notifications";
import { internalPath } from "@/lib/links";
import type { Notice } from "@/lib/notices";
import { requireViewer, type Viewer } from "@/lib/viewer";
import { type EventContext, busyFor, committeesFor, eventAccess, eventActor, eventContext, mayBookRestricted } from "@/lib/events/context";
import { syncHolds } from "@/lib/events/holds";
import { type EventFormInput, draftInput, parseEventInput } from "@/lib/events/input";
import { eventCommentNotices, eventNotices } from "@/lib/events/notices";
import { roomById } from "@/lib/events/rooms";
import { taskUnlockNotices } from "@/lib/events/tasks";
import { type Clash, eventChecks } from "@/lib/events/rules";
import { addDays } from "@/lib/dates";
import * as sr from "@/lib/events/slot-requests";
import { slotRequestStore } from "@/lib/events/slot-requests-store";
import type { Check, EventInput } from "@/lib/events/types";
import * as wf from "@/lib/events/workflow";
import { checkRenewalDates, renewalState } from "@/lib/events/renewal";
import { lc } from "@/lib/text";
import { WorkflowError } from "@/lib/workflow-core";
import { actOnCard, commentOnCard, unknownAction } from "@/lib/card-actions";
import { filesFrom } from "@/lib/drive";
import { checkFiles } from "@/lib/marketing/files";
import { NOT_SET_UP, marketingFolder, saveEventImages } from "@/lib/marketing/drive";
import { addImages, imagesOf, imagesPermission } from "@/lib/events/images";
import { syncPieces } from "@/lib/marketing/pieces";
import type { FormState } from "@/components/FormErrors";


/** A clash, as the form shows it: whether its holder can be asked, and if not, why. */
export type ClashView = { key: string; label: string; roomName: string; start: string; end: string; dates: string[]; kind: Clash["kind"]; askable: boolean; why?: string };
export type TimelineView = { roomName: string; date: string; items: { start: string; end: string; label: string; kind: string }[]; request?: { start: string; end: string } };
/** `timelines`: the day on each room asked for, in the order picked. */
export type DraftCheck = { checks: Check[]; clashes: ClashView[]; timelines: TimelineView[] };

const nowIso = () => new Date().toISOString();

async function checksFor(ctx: EventContext, viewer: Viewer, input: EventInput, editing?: wf.EventCard) {
  const busy = await busyFor(ctx, input);
  const gaveTo = editing?.event.releasedFor ? await gaveToKey(editing.event.releasedFor) : undefined;
  return { busy, ...eventChecks(input, { rooms: ctx.rooms, busy, today: ctx.today, rules: ctx.rules, mayBookRestricted: mayBookRestricted(viewer), excludeCard: editing?.id, gaveTo }) };
}

/** A card moved to give up its time can't take that time back: the key of the request it gave it to. */
async function gaveToKey(askId: string): Promise<string | undefined> {
  const ask = await (await slotRequestStore()).get(askId);
  return ask ? `card:${ask.fromCard}` : undefined;
}

/** Whether this person can ask the clash's holder for the time, and if not, why. */
async function askability(c: Clash, viewer: Viewer): Promise<{ askable: boolean; why?: string }> {
  const store = await cardStore();
  if (c.cardId) {
    const holder = await store.get(c.cardId);
    if (holder && lc(holder.ownerEmail) === lc(viewer.email)) return { askable: false, why: "This is your own booking. Change it from its request instead." };
  } else if (c.organizerEmail && lc(c.organizerEmail) === lc(viewer.email)) return { askable: false, why: "This is your own calendar entry." };
  const existing = await (await slotRequestStore()).listForHold(c.cardId ? `card:${c.cardId}` : `cal:${c.eventId}`);
  for (const r of existing) {
    const both = r.dates.filter((d) => c.dates.includes(d));
    if (!both.length) continue;
    if (sr.isOpenAsk(r)) return { askable: false, why: `Someone already asked for this time (${r.id}). Wait for that answer or pick another time.` };
    if (r.status === "kept") return { askable: false, why: `${c.label} was kept when someone asked before. Pick another time.` };
  }
  return { askable: true };
}

/** The live checks for the request form, while someone is filling it in. */
export async function checkDraft(raw: EventFormInput & { editing?: string }): Promise<DraftCheck> {
  const viewer = await requireViewer();
  const ctx = await eventContext();
  const input = draftInput(raw, { committees: committeesFor(viewer, ctx.dir), roomIds: ctx.bookable.map((r) => r.id) });
  if (!input) return { checks: [], clashes: [], timelines: [] };
  const editing = raw.editing ? await (await cardStore()).get(String(raw.editing)) : null;
  const r = await checksFor(ctx, viewer, input, wf.isEventCard(editing) ? editing : undefined);
  const clashes: ClashView[] = await Promise.all(
    r.clashes.map(async (c) => ({ key: c.key, label: c.label, roomName: roomById(ctx.rooms, c.roomId)?.name ?? "", start: c.start, end: c.end, dates: c.dates, kind: c.kind, ...(await askability(c, viewer)) })),
  );
  const day = input.date;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const fm = (m: number) => `${String(Math.floor(Math.max(0, m) / 60)).padStart(2, "0")}:${String(Math.max(0, m) % 60).padStart(2, "0")}`;
  const request = { start: fm(toMin(input.start) - input.setup), end: fm(toMin(input.end) + input.teardown) };
  const timelines: TimelineView[] = input.rooms.flatMap((id) => {
    const room = roomById(ctx.rooms, id);
    if (!room) return [];
    const seen = new Set<string>();
    const items = r.busy
      .filter((b) => b.date === day && (!wf.isEventCard(editing) || b.cardId !== editing.id))
      .filter((b) => roomById(ctx.rooms, b.roomId) && (b.roomId === room.id || room.overlaps.includes(b.roomId) || roomById(ctx.rooms, b.roomId)!.overlaps.includes(room.id)))
      .filter((b) => {
        const k = `${b.label}|${b.start}|${b.end}`;
        return !seen.has(k) && Boolean(seen.add(k));
      })
      .map((b) => ({ start: b.start, end: b.end, label: b.label, kind: b.kind }));
    return [{ roomName: room.name, date: day, items, request }];
  });
  return { checks: r.checks, clashes, timelines };
}

/** The Hold an ask is about, from the clash and its holder. */
async function holdFor(c: Clash, ctx: EventContext): Promise<sr.Hold> {
  const room = roomById(ctx.rooms, c.roomId);
  const base = { label: c.label, room: room?.name ?? "the room", start: c.start, end: c.end };
  if (c.cardId) {
    const holder = await (await cardStore()).get(c.cardId);
    if (wf.isEventCard(holder)) {
      const hold = holder.event.holds.find((h) => h.roomId === c.roomId) ?? holder.event.holds[0];
      return { ...base, label: holder.title, kind: holder.status === "approved" ? "booking" : "pending", cardId: holder.id, ownerEmail: holder.ownerEmail, committeeGroup: holder.event.committeeGroup, calendarEventId: hold?.eventId, calendarId: hold?.calendarId, seriesDates: holder.event.dates };
    }
  }
  const calendarId = room?.calendarId;
  const seriesDates = calendarId && c.eventId ? await ctx.calendar.seriesDates(calendarId, c.eventId, ctx.today, addDays(ctx.today, 366)) : c.dates;
  return { ...base, kind: "booking", calendarEventId: c.eventId, calendarId, organizerEmail: c.organizerEmail, seriesDates: seriesDates.length ? seriesDates : c.dates };
}

/** Holds failed to sync: say so on the card and tell the office, who fix the calendar by hand. */
function calendarTrouble(card: wf.EventCard, error: string | undefined): { card: wf.EventCard; notices: Notice[] } {
  if (!error) return { card, notices: [] };
  const next = { ...card, event: { ...card.event, history: [...card.event.history, { at: nowIso(), by: "portal", action: "Couldn't update the room calendar", note: error }] } };
  return { card: next, notices: [{ to: { role: "office" }, cardId: card.id, href: `/events/${card.id}`, text: `${card.id} “${card.title}”: the portal couldn't update the room calendar. Please check its rooms on Google Calendar.`, alert: true, delegable: false }] };
}

/** Create or resubmit an event request, optionally asking for a booked time. `editing`: the card being resubmitted. */
export async function submitEvent(editing: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const actor = eventActor(viewer);
  let raw: EventFormInput & { ask?: { key?: string; reason?: string }; renews?: string };
  try {
    raw = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {
    return { errors: ["The form couldn't be read. Reload the page and try again."] };
  }
  const ctx = await eventContext();
  const store = await cardStore();
  const existing = editing ? await store.get(editing) : null;
  if (editing && !wf.isEventCard(existing)) return { errors: ["That request no longer exists."] };
  const card0 = wf.isEventCard(existing) ? existing : undefined;
  if (card0) {
    const p = wf.permission(card0, actor, "resubmit");
    if (!p.ok) return { errors: [p.reason] };
  }
  // Renewing a series: the request it renews must be open for renewal, and the next period starts after it ends.
  let prior: wf.EventCard | undefined;
  if (!card0 && raw.renews) {
    const p = await store.get(String(raw.renews));
    if (!wf.isEventCard(p)) return { errors: ["The series you're renewing no longer exists."] };
    const next = p.event.renewedBy ? await store.get(p.event.renewedBy) : null;
    const state = renewalState(p, { email: viewer.email, office: viewer.actingRoles.includes("office") }, ctx.today, wf.isEventCard(next) ? next : null);
    if (!state.can) return { errors: [state.why] };
    prior = p;
  }
  const committees = committeesFor(viewer, ctx.dir);
  const keep = card0 ?? prior;
  if (keep && !committees.some((c) => c.group === keep.event.committeeGroup)) committees.push({ group: keep.event.committeeGroup, name: keep.event.committeeName });
  const parsed = parseEventInput(raw, { committees, roomIds: ctx.bookable.map((r) => r.id) });
  if (!parsed.ok) return { errors: parsed.errors };
  const input = parsed.input;
  if (prior) {
    const bad = checkRenewalDates(prior, input.date);
    if (bad) return { errors: [bad] };
  }

  // Images for marketing, checked before anything is saved.
  const images = input.isPublic ? filesFrom(form, "images") : [];
  if (images.length) {
    const problems = (await marketingFolder()) ? checkFiles(images, card0 ? imagesOf(card0).length : 0, { imagesOnly: true }) : [NOT_SET_UP];
    if (problems.length) return { errors: problems };
  }

  const r = await checksFor(ctx, viewer, input, card0);
  const others = r.checks.filter((c) => c.block && c.rule !== "IAR Google Calendar");
  if (others.length) return { errors: others.map((c) => c.text) };
  let ask: { clash: Clash; reason: string } | null = null;
  if (r.clashes.length) {
    const wanted = raw.ask?.key;
    const c = r.clashes.find((x) => x.key === wanted);
    if (!wanted || !c) return { errors: r.clashes.map((x) => `${roomById(ctx.rooms, x.roomId)?.name ?? "The room"} is taken: ${x.label}. Pick another time or room, or ask whoever booked it to give it up.`) };
    if (r.clashes.length > 1) return { errors: ["You can ask for one booked time at a time. Change the time or room so only one booking is in the way."] };
    const can = await askability(c, viewer);
    if (!can.askable) return { errors: [can.why ?? "This time can't be asked for."] };
    const reason = String(raw.ask?.reason ?? "").trim();
    if (!reason) return { errors: ["Say why you need this time, so they can decide."] };
    ask = { clash: c, reason };
  }

  const now = nowIso();
  const directors = ctx.directorsOf(input.committeeGroup);
  const slots = await slotRequestStore();
  let card: wf.EventCard;
  let before: wf.EventCard | null = card0 ?? null;
  let created: sr.SlotRequest | null = null;
  if (card0) card = card0;
  else {
    const { id: _blank, ...draft } = wf.newEvent(input, actor, now, r.checks);
    if (prior) draft.event = { ...draft.event, renews: prior.id, history: [{ at: now, by: actor.email, action: `Next period of ${prior.id}` }] };
    card = (await store.create(draft, "EV")) as wf.EventCard;
    before = null;
  }
  if (ask) {
    const hold = await holdFor(ask.clash, ctx);
    const nr = sr.newSlotRequest({ fromCard: card.id, requester: actor, hold, dates: ask.clash.dates, reason: ask.reason }, ctx.dir, await slots.listForHold(sr.holdKeyOf(hold)), now);
    if (!nr.ok) return { errors: [nr.error] };
    created = await slots.create(nr.value);
  }
  const routed = card0 ? wf.resubmit(card0, input, actor, directors, now, r.checks, { waitingOnAsk: created?.id }) : wf.submit(card, actor, directors, now, { waitingOnAsk: created?.id });
  const synced = await syncHolds(routed, ctx);
  const trouble = calendarTrouble(synced.card, synced.error);
  try {
    await store.save(trouble.card, card.updatedAt);
  } catch (err) {
    return { errors: [err instanceof ConflictError ? err.message : "Something went wrong saving the request."] };
  }
  if (prior) {
    // Link the series to its next period; a hiccup here doesn't undo the new request.
    try {
      const fresh = await store.get(prior.id);
      if (wf.isEventCard(fresh)) await store.save({ ...fresh, event: { ...fresh.event, renewedBy: card.id, history: [...fresh.event.history, { at: now, by: actor.email, action: `Next period requested: ${card.id}` }] }, updatedAt: now }, fresh.updatedAt);
    } catch (err) {
      console.error("linking a renewal failed", err);
    }
  }
  // Its marketing pieces follow a resubmitted event (a new date, or approved straight away after a move).
  const pieces = before ? await syncPieces(before, trouble.card, actor) : [];
  await deliver([...eventNotices(before, trouble.card, actor, directors), ...taskUnlockNotices(before, trouble.card), ...(created ? sr.slotNotices(null, created, actor.email) : []), ...trouble.notices, ...pieces], actor.email);
  revalidatePath("/events");
  if (images.length) {
    try {
      await attachImages(card.id, actor, await saveEventImages(input.title, input.date, images));
    } catch (err) {
      console.error("event image upload failed", err);
      redirect(`/events/${card.id}?sent=1&error=${encodeURIComponent("Your request was sent, but the images didn't upload. Try adding them again on this page.")}#images`);
    }
  }
  // The request page says "Sent." with what happens next (RequestPage `sent`).
  redirect(`/events/${card.id}?sent=1`);
}

/**
 * Adds uploaded images to the latest copy of the request. Someone may have
 * saved it while the images uploaded (a slow upload, an approval), so it
 * tries once more on a fresh copy.
 */
async function attachImages(id: string, actor: wf.EventActor, saved: Awaited<ReturnType<typeof saveEventImages>>): Promise<void> {
  const store = await cardStore();
  for (let attempt = 0; attempt < 2; attempt++) {
    const latest = await store.get(id);
    if (!wf.isEventCard(latest)) throw new WorkflowError("That request no longer exists.");
    try {
      await store.save(addImages(latest, actor, nowIso(), saved), latest.updatedAt);
      return;
    } catch (err) {
      if (!(err instanceof ConflictError) || attempt === 1) throw err;
    }
  }
}

/** Images for marketing, added from the request page by the requester or the marketing team. Never changes the stage. */
export async function addEventImages(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = eventActor(viewer);
  const id = String(form.get("id") ?? "");
  const store = await cardStore();
  const card = await store.get(id);
  if (!wf.isEventCard(card)) redirect("/events");
  const back = (q: string) => {
    revalidatePath(`/events/${id}`);
    redirect(`/events/${id}?${q}#images`);
  };
  const allowed = imagesPermission(card, actor);
  if (!allowed.ok) back(`error=${encodeURIComponent(allowed.reason)}`);
  const files = filesFrom(form, "images");
  if (files.length === 0) back(`error=${encodeURIComponent("Choose an image first.")}`);
  const problems = (await marketingFolder()) ? checkFiles(files, imagesOf(card).length, { imagesOnly: true }) : [NOT_SET_UP];
  if (problems.length) back(`error=${encodeURIComponent(problems.join(" "))}`);

  let error: string | null = null;
  try {
    await attachImages(id, actor, await saveEventImages(card.title, card.event.date, files));
  } catch (err) {
    if (err instanceof WorkflowError) error = err.message;
    else {
      console.error("event image upload failed", err);
      error = "The images didn't upload. Try again.";
    }
  }
  back(error ? `error=${encodeURIComponent(error)}` : "ok=images");
}

const events = { path: "/events", is: wf.isEventCard, canOpen: async (card: wf.EventCard, viewer: Viewer) => (await eventAccess(card, viewer)).open };

/** Approve, send back, deny or cancel. */
export async function actOnEvent(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = eventActor(viewer);
  const note = String(form.get("note") ?? "").slice(0, 1000);
  const ctx = await eventContext();
  await actOnCard(form, viewer, {
    ...events,
    async act(card, action, now) {
      const directors = ctx.directorsOf(card.event.committeeGroup);
      let next: wf.EventCard;
      if (action === "approve") {
        // Check the calendar again: something may have been booked since it was submitted.
        const live = (await checksFor(ctx, viewer, card.event, card)).clashes.filter((c) => c.kind !== "pending");
        if (live.length) throw new WorkflowError(`It now clashes with ${live.map((c) => c.label).join(", ")} on the room calendar. Send it back so the requester can pick another time.`);
        next = wf.approve(card, actor, directors, now, note || undefined);
      } else if (action === "return") next = wf.returnForChanges(card, actor, directors, now, note);
      else if (action === "deny") next = wf.deny(card, actor, directors, now, note);
      else if (action === "cancel") next = wf.cancel(card, actor, directors, now);
      else return unknownAction();
      const synced = await syncHolds(next, ctx);
      const trouble = calendarTrouble(synced.card, synced.error);
      return {
        next: trouble.card,
        notices: [...eventNotices(card, trouble.card, actor, directors), ...taskUnlockNotices(card, trouble.card), ...trouble.notices],
        // Once saved: a cancelled request withdraws its asks; its marketing pieces follow the event either way.
        after: async () => [...(action === "cancel" ? await withdrawOpenAsks(card.id, actor, now) : []), ...(await syncPieces(card, trouble.card, actor))],
      };
    },
  });
}

export async function actOnEventWith(action: wf.EventAction, form: FormData): Promise<void> {
  form.set("action", action);
  return actOnEvent(form);
}

/** A cancelled request doesn't keep asking for someone else's time. */
async function withdrawOpenAsks(cardId: string, actor: wf.EventActor, now: string): Promise<Notice[]> {
  const slots = await slotRequestStore();
  const out: Notice[] = [];
  for (const a of (await slots.listFromCard(cardId)).filter(sr.isOpenAsk)) {
    const w = sr.withdraw(a, actor, now);
    if (!w.ok) continue;
    await slots.save(w.value, a.updatedAt);
    out.push(...sr.slotNotices(a, w.value, actor.email));
  }
  return out;
}

/** The holder (or the director, after no answer) decides on an ask for their booked time. */
export async function decideAsk(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = eventActor(viewer);
  const id = String(form.get("ask") ?? "");
  const choice = String(form.get("choice") ?? "") as sr.SlotChoice;
  const note = String(form.get("note") ?? "").slice(0, 1000);
  const back = internalPath(String(form.get("back") ?? "")) ?? "/events";
  const slots = await slotRequestStore();
  const store = await cardStore();
  const req = await slots.get(id);
  if (!req) redirect(back);
  const d = sr.decide(req, actor, choice, note, nowIso());
  if (!d.ok) redirect(`${back}?error=${encodeURIComponent(d.error)}`);
  const ctx = await eventContext();
  const now = nowIso();
  const notices: Notice[] = [];
  let error: string | null = null;
  try {
    await slots.save(d.value.request, req.updatedAt);
    notices.push(...sr.slotNotices(req, d.value.request, actor.email));
    // The holder's side: their card changes, or the calendar-only entry loses those dates.
    if (req.hold.cardId) {
      const holder = await store.get(req.hold.cardId);
      if (wf.isEventCard(holder)) {
        const hd = ctx.directorsOf(holder.event.committeeGroup);
        const o = d.value.owner;
        const changed =
          o.action === "edit" ? wf.releaseToMove(holder, hd, now, req.id, o.dates) : o.action === "cancel" ? wf.cancelForAsk(holder, hd, now, req.id) : o.action === "drop_dates" ? wf.dropDates(holder, hd, now, req.id, o.dates) : null;
        if (changed) {
          const synced = await syncHolds(changed, ctx);
          const trouble = calendarTrouble(synced.card, synced.error);
          await store.save(trouble.card, holder.updatedAt);
          notices.push(...trouble.notices, ...(o.action === "edit" ? [] : eventNotices(holder, trouble.card, actor, hd)), ...(await syncPieces(holder, trouble.card, actor)));
        }
      }
    } else if (req.hold.calendarId) {
      try {
        for (const op of d.value.calendar) await ctx.calendar.applyOp(req.hold.calendarId, op);
      } catch (err) {
        console.error("freeing calendar dates failed", err);
        notices.push({ to: { role: "office" }, href: `/events/${req.fromCard}`, cardId: req.fromCard, text: `${req.hold.label} gave up ${sr.datesText(req.dates)} for ${req.fromCard}, but the portal couldn't change the calendar entry. Please free those dates on the room calendar.`, alert: true, delegable: false });
      }
    }
    // The requester's side: into mission review, or back to pick another time.
    const from = await store.get(req.fromCard);
    if (wf.isEventCard(from)) {
      const fd = ctx.directorsOf(from.event.committeeGroup);
      const changed = d.value.requester.action === "to_review" ? wf.slotGranted(from, fd, now, req.id) : wf.slotRefused(from, fd, now, d.value.requester.note);
      const synced = await syncHolds(changed, ctx);
      const trouble = calendarTrouble(synced.card, synced.error);
      await store.save(trouble.card, from.updatedAt);
      notices.push(...trouble.notices, ...eventNotices(from, trouble.card, actor, fd).filter((n) => !("email" in n.to && n.to.email === from.ownerEmail)));
    }
  } catch (err) {
    console.error("deciding an ask failed", err);
    error = err instanceof ConflictError ? err.message : "Something went wrong. Check the request and try again.";
  }
  await deliver(notices, actor.email);
  revalidatePath("/events");
  redirect(error ? `${back}?error=${encodeURIComponent(error)}` : `${back}?ok=decided`);
}

/** For the ask's buttons: a button's own name/value doesn't reach a server action, so each binds its choice. */
export async function decideAskWith(choice: sr.SlotChoice, form: FormData): Promise<void> {
  form.set("choice", choice);
  return decideAsk(form);
}

/** The requester takes back their ask; their request goes back to them to pick another time. */
export async function withdrawAsk(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = eventActor(viewer);
  const id = String(form.get("ask") ?? "");
  const slots = await slotRequestStore();
  const req = await slots.get(id);
  if (!req) redirect("/events");
  const w = sr.withdraw(req, actor, nowIso());
  if (!w.ok) redirect(`/events/${req.fromCard}?error=${encodeURIComponent(w.error)}`);
  await slots.save(w.value, req.updatedAt);
  const store = await cardStore();
  const from = await store.get(req.fromCard);
  if (wf.isEventCard(from) && from.event.stage === "slot") {
    const ctx = await eventContext();
    const next = wf.slotRefused(from, ctx.directorsOf(from.event.committeeGroup), nowIso(), "You withdrew your ask. Pick another time or room.");
    await store.save(next, from.updatedAt);
  }
  await deliver(sr.slotNotices(req, w.value, actor.email), actor.email);
  revalidatePath(`/events/${req.fromCard}`);
  redirect(`/events/${req.fromCard}?ok=withdrawn`);
}

export async function commentOnEvent(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const actor = eventActor(viewer);
  const ctx = await eventContext();
  await commentOnCard(form, viewer, { ...events, notices: (card, text) => eventCommentNotices(card, actor, text, ctx.directorsOf(card.event.committeeGroup)) });
}
