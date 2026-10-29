"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ACT_AS_COOKIE, ACT_AS_MINUTES, signActAs } from "@/lib/act-as";
import { audit } from "@/lib/audit";
import { directory, lookupGroups } from "@/lib/groups";
import { nameOf } from "@/lib/names";
import { DEV_DOMAIN, isDevAuth } from "@/lib/dev";
import { ORG, mayUsePortal } from "@/lib/org";
import { settingsStore } from "@/lib/portal-settings";
import { FUNDS } from "@/lib/purchases/accounts";
import { checkCard, checkRoomSetting, checkTeamFund } from "@/lib/settings-rules";
import { googleRooms } from "@/lib/rooms-google";
import { RULES } from "@/lib/events/rules";
import { parseDriveId } from "@/lib/library-core";
import { requireViewer } from "@/lib/viewer";
import type { AdminSection } from "./sections";

async function requireAdmin() {
  const viewer = await requireViewer();
  if (!viewer.actingRoles.includes("admins")) redirect("/");
  return viewer;
}

/** Back to Portal Settings with a message, and the section the change was made in left open. */
const back = (msg: { ok?: string; error?: string }, open: AdminSection) => {
  revalidatePath("/admin");
  const q = msg.error ? `error=${encodeURIComponent(msg.error)}` : `ok=${encodeURIComponent(msg.ok ?? "Saved")}`;
  redirect(`/admin?${q}&open=${open}`);
};

/** Which fund a team charges. An empty choice goes back to the suggestion. */
export async function saveTeamFund(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const group = String(form.get("group") ?? "").toLowerCase();
  const fund = String(form.get("fund") ?? "");
  const dir = await directory();
  const check = checkTeamFund(group, fund, { funds: FUNDS, teamGroups: dir.teams.map((t) => t.email) });
  if (!check.ok) return back({ error: check.error }, "teams");
  const store = await settingsStore();
  const s = await store.get();
  const teamFunds = { ...s.teamFunds };
  if (fund) teamFunds[group] = fund;
  else delete teamFunds[group];
  await store.save({ ...s, teamFunds, updatedAt: new Date().toISOString(), updatedBy: viewer.email });
  const name = dir.teams.find((t) => t.email === group)?.name ?? group;
  back({ ok: fund ? `${name} now charges ${fund}.` : `${name} is back to the suggested fund.` }, "teams");
}

export async function addCard(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const store = await settingsStore();
  const s = await store.get();
  const r = checkCard(
    { last4: form.get("last4"), holderEmail: form.get("holderEmail"), holderName: form.get("holderName") },
    { domain: isDevAuth() ? DEV_DOMAIN : ORG.domain, existing: s.cards },
  );
  if (!r.ok) return back({ error: r.error }, "cards");
  await store.save({ ...s, cards: [...s.cards, r.card], updatedAt: new Date().toISOString(), updatedBy: viewer.email });
  back({ ok: `Card ending ${r.card.last4} added.` }, "cards");
}

export async function removeCard(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const last4 = String(form.get("last4") ?? "");
  const store = await settingsStore();
  const s = await store.get();
  await store.save({ ...s, cards: s.cards.filter((c) => c.last4 !== last4), updatedAt: new Date().toISOString(), updatedBy: viewer.email });
  back({ ok: `Card ending ${last4} removed. Its past receipts are kept.` }, "cards");
}

/** A room's portal settings: bookable, food, shared space, restricted, a note. */
export async function saveRoom(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const roomId = String(form.get("room") ?? "");
  const rooms = await googleRooms();
  const r = checkRoomSetting(
    roomId,
    { bookable: form.get("bookable"), food: form.get("food"), restricted: form.get("restricted"), mph: form.get("mph"), overlaps: form.getAll("overlaps"), note: form.get("note") },
    { roomIds: rooms.map((x) => x.id) },
  );
  if (!r.ok) return back({ error: r.error }, "rooms");
  const store = await settingsStore();
  const s = await store.get();
  await store.save({ ...s, rooms: { ...(s.rooms ?? {}), [roomId]: r.setting }, updatedAt: new Date().toISOString(), updatedBy: viewer.email });
  back({ ok: `${rooms.find((x) => x.id === roomId)?.name ?? "Room"} saved.` }, "rooms");
}

/** Turn event policy rules on or off. */
export async function saveEventRules(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const store = await settingsStore();
  const s = await store.get();
  const eventRules = Object.fromEntries(RULES.map((rule) => [rule.id, form.get(rule.id) === "on"]));
  // Only a web link: it opens in a new tab from the event form. A file picked from the Library wins over a typed link.
  const picked = String(form.get("roomPolicyFile") ?? "").trim();
  const url = (picked || String(form.get("roomPolicyUrl") ?? "")).trim().slice(0, 500);
  const roomPolicyUrl = /^https:\/\/\S+$/.test(url) ? url : "";
  await store.save({ ...s, eventRules, roomPolicyUrl, updatedAt: new Date().toISOString(), updatedBy: viewer.email });
  back({ ok: "Event rules saved." }, "rules");
}

/** Payment requests as a demo (only testers' requests send alerts) or live for everyone. */
export async function savePurchasesDemo(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const store = await settingsStore();
  const s = await store.get();
  const demo = form.get("demo") === "on";
  await store.save({ ...s, purchasesDemo: demo, updatedAt: new Date().toISOString(), updatedBy: viewer.email });
  revalidatePath("/purchases", "layout");
  back({ ok: demo ? "Payment requests are a demo." : "Payment requests are live for everyone." }, "purchases");
}

/** The Policies Shared Drive the Library lists: its link from the browser, or its ID. Empty disconnects it. */
export async function savePoliciesDrive(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const raw = String(form.get("policiesDrive") ?? "").trim().slice(0, 300);
  const id = raw ? parseDriveId(raw) : "";
  if (id === null) return back({ error: "That isn't a Shared Drive link. Open the drive in Google Drive and copy the address from the browser." }, "library");
  const store = await settingsStore();
  const s = await store.get();
  await store.save({ ...s, policiesDrive: id, updatedAt: new Date().toISOString(), updatedBy: viewer.email });
  revalidatePath("/library");
  back({ ok: id ? "Policies drive connected. The Library lists it within a few minutes." : "Policies drive disconnected." }, "library");
}

/**
 * Signs this admin in as someone else, to see and do what they would, for an
 * hour or until they stop. Everything they save says the admin did it, and
 * the start, the stop and each save go in the audit log.
 */
export async function startActingAs(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  if (viewer.dev || isDevAuth()) return back({ error: "In dev mode, switch sample users at /dev instead." }, "support");
  const target = String(form.get("email") ?? "").trim().toLowerCase();
  if (!target.endsWith(`@${ORG.domain}`)) return back({ error: `Enter an @${ORG.domain} address.` }, "support");
  if (target === viewer.email.toLowerCase()) return back({ error: "That's you." }, "support");
  let groups: string[];
  try {
    groups = await lookupGroups(target);
  } catch {
    return back({ error: "Couldn't look that person up in Google. Check the address." }, "support");
  }
  if (!mayUsePortal(groups)) return back({ error: "That person can't sign in to the portal yet." }, "support");
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return back({ error: "Signing in as someone needs NEXTAUTH_SECRET, which isn't set." }, "support");
  const targetName = await nameOf(target);
  const token = signActAs({ admin: viewer.email.toLowerCase(), adminName: viewer.name, target, targetName, exp: Date.now() + ACT_AS_MINUTES * 60_000 }, secret);
  (await cookies()).set(ACT_AS_COOKIE, token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: ACT_AS_MINUTES * 60 });
  await audit({ admin: viewer.email.toLowerCase(), target, action: "Started signing in as them" });
  revalidatePath("/", "layout");
  redirect("/");
}
