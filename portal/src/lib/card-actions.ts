import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canOpenCard } from "./access";
import { type Card, cardStore, ConflictError } from "./cards";
import { checkComment, findMentions, withComment } from "./comments";
import { mentionablePeople } from "./mentions";
import type { Notice } from "./notices";
import { deliver } from "./notifications";
import { actorFor } from "./people";
import type { Viewer } from "./viewer";
import { WorkflowError } from "./workflow-core";

/**
 * The parts every module's server actions share: load the request, check
 * it's still as the person saw it, save, tell whoever needs to know, and go
 * back to the request with a message. Each module's actions.ts supplies
 * only what's its own: which card, who may open it, and what each action
 * does (its workflow.ts).
 */

const nowIso = () => new Date().toISOString();
const page = (path: string, id: string, q: string) => `${path}/${id}?${q}`;
const err = (msg: string) => `error=${encodeURIComponent(msg)}`;

/** Whether this person may open the card: the module's own rule, with portal admins seeing everything for support. */
export async function mayOpen(card: Card, viewer: Viewer): Promise<boolean> {
  return canOpenCard(card, { ...(await actorFor(viewer)), seeAll: viewer.roles.includes("admins") });
}

type Module<C extends Card> = {
  /** Where the module's pages are ("/marketing"). */
  path: string;
  is(card: Card | null | undefined): card is C;
  /** Who may open it, when the module's view rule needs more than lib/access.ts (events: whoever is asked for their time). */
  canOpen?(card: C, viewer: Viewer): Promise<boolean>;
};

/**
 * Adds a comment. Anyone who can open the request can comment. If someone
 * saved the request at the same moment it tries once more: a comment never
 * needs to wait. "@Name" for someone who can open the request names them
 * (lib/notices.ts tells them). `after` lets a module note the comment on the
 * card itself (a ticket's first response).
 */
export async function commentOnCard<C extends Card>(
  form: FormData,
  viewer: Viewer,
  m: Module<C> & { notices(card: C, text: string): Notice[] | Promise<Notice[]>; after?(card: C, now: string): C },
): Promise<never> {
  const id = String(form.get("id") ?? "");
  const by = viewer.email.toLowerCase();
  const store = await cardStore();
  const check = checkComment(form.get("text"));
  let error: string | null = check.ok ? null : check.error;
  if (check.ok) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const card = await store.get(id);
      if (!m.is(card) || !(await (m.canOpen ?? mayOpen)(card, viewer))) redirect(m.path);
      const now = nowIso();
      const mentions = check.text.includes("@") ? findMentions(check.text, await mentionablePeople(card), by) : [];
      const commented = withComment(card, { at: now, by, name: viewer.name, text: check.text, mentions });
      const next = m.after ? m.after(commented, now) : commented;
      try {
        await store.save(next, card.updatedAt);
        await deliver(await m.notices(next, check.text), by);
        error = null;
        break;
      } catch (e) {
        if (!(e instanceof ConflictError) || attempt === 1) {
          if (!(e instanceof ConflictError)) console.error("comment failed", e);
          error = "Your comment couldn't be saved. Try again.";
        }
      }
    }
  }
  revalidatePath(`${m.path}/${id}`);
  redirect(`${page(m.path, id, error ? err(error) : "ok=commented")}#comments`);
}

/** What one action did: the card to save, who to tell, and anything to do once it's saved. */
export type ActionResult<C extends Card> = {
  next: C;
  notices: Notice[];
  /** Runs after the save (a vendor's record, withdrawing open asks); may add notices. */
  after?: () => Promise<Notice[] | void>;
};

/**
 * One action on a request (approve, schedule, resolve…). Refuses if the
 * request changed since the person opened it. A refused step (WorkflowError)
 * or someone saving first (ConflictError) comes back as the message; any
 * other failure is logged and nothing is changed.
 */
export async function actOnCard<C extends Card>(
  form: FormData,
  viewer: Viewer,
  m: Module<C> & { noun?: string; act(card: C, action: string, now: string): Promise<ActionResult<C>> },
): Promise<never> {
  const id = String(form.get("id") ?? "");
  const action = String(form.get("action") ?? "");
  const store = await cardStore();
  const card = await store.get(id);
  if (!m.is(card) || !(await (m.canOpen ?? mayOpen)(card, viewer))) redirect(m.path);
  if (String(form.get("expected") ?? "") !== card.updatedAt) redirect(page(m.path, id, err(`This ${m.noun ?? "request"} changed while you were looking at it. Check it again before acting.`)));
  let error: string | null = null;
  try {
    const r = await m.act(card, action, nowIso());
    await store.save(r.next, card.updatedAt);
    const more = r.after ? await r.after() : undefined;
    await deliver([...r.notices, ...(more ?? [])], viewer.email.toLowerCase());
  } catch (e) {
    if (e instanceof WorkflowError || e instanceof ConflictError) error = e.message;
    else {
      console.error(`${m.path} action failed`, e);
      error = "Something went wrong. Nothing was changed.";
    }
  }
  revalidatePath(m.path);
  revalidatePath(`${m.path}/${id}`);
  redirect(page(m.path, id, error ? err(error) : `ok=${action}`));
}

/** The unknown-action refusal every module's switch ends with. */
export function unknownAction(): never {
  throw new WorkflowError("Unknown action.");
}
