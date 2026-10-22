"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { directory } from "@/lib/groups";
import { DEV_DOMAIN, isDevAuth } from "@/lib/dev";
import { ORG } from "@/lib/org";
import { settingsStore } from "@/lib/portal-settings";
import { FUNDS } from "@/lib/purchases/accounts";
import { checkCard, checkTeamFund } from "@/lib/settings-rules";
import { requireViewer } from "@/lib/viewer";

async function requireAdmin() {
  const viewer = await requireViewer();
  if (!viewer.actingRoles.includes("admins")) redirect("/");
  return viewer;
}

const back = (msg: { ok?: string; error?: string }) => {
  revalidatePath("/admin");
  redirect(msg.error ? `/admin?error=${encodeURIComponent(msg.error)}` : `/admin?ok=${encodeURIComponent(msg.ok ?? "Saved")}`);
};

/** Which fund a team charges. An empty choice goes back to the suggestion. */
export async function saveTeamFund(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const group = String(form.get("group") ?? "").toLowerCase();
  const fund = String(form.get("fund") ?? "");
  const dir = await directory();
  const check = checkTeamFund(group, fund, { funds: FUNDS, teamGroups: dir.teams.map((t) => t.email) });
  if (!check.ok) return back({ error: check.error });
  const store = await settingsStore();
  const s = await store.get();
  const teamFunds = { ...s.teamFunds };
  if (fund) teamFunds[group] = fund;
  else delete teamFunds[group];
  await store.save({ ...s, teamFunds, updatedAt: new Date().toISOString(), updatedBy: viewer.email });
  const name = dir.teams.find((t) => t.email === group)?.name ?? group;
  back({ ok: fund ? `${name} now charges ${fund}.` : `${name} is back to the suggested fund.` });
}

export async function addCard(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const store = await settingsStore();
  const s = await store.get();
  const r = checkCard(
    { last4: form.get("last4"), holderEmail: form.get("holderEmail"), holderName: form.get("holderName"), fund: form.get("fund") },
    { funds: FUNDS, domain: isDevAuth() ? DEV_DOMAIN : ORG.domain, existing: s.cards },
  );
  if (!r.ok) return back({ error: r.error });
  await store.save({ ...s, cards: [...s.cards, r.card], updatedAt: new Date().toISOString(), updatedBy: viewer.email });
  back({ ok: `Card ending ${r.card.last4} added.` });
}

export async function removeCard(form: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const last4 = String(form.get("last4") ?? "");
  const store = await settingsStore();
  const s = await store.get();
  await store.save({ ...s, cards: s.cards.filter((c) => c.last4 !== last4), updatedAt: new Date().toISOString(), updatedBy: viewer.email });
  back({ ok: `Card ending ${last4} removed. Its past receipts are kept.` });
}
