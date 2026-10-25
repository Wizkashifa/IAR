"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { directory } from "@/lib/groups";
import { settingsStore } from "@/lib/portal-settings";
import { requireViewer } from "@/lib/viewer";
import { checkTeamInfo, mayEditTeam, teamEntries } from "@/lib/whos-who";

/** What a team handles and its Chat space link. The team's chair or vice chair, or a portal admin. */
export async function saveTeamInfo(form: FormData): Promise<void> {
  const viewer = await requireViewer();
  const slug = String(form.get("slug") ?? "");
  const store = await settingsStore();
  const s = await store.get();
  const team = teamEntries(await directory(), s.teamInfo).find((t) => t.slug === slug);
  if (!team) redirect("/teams");
  const back = (q: string) => {
    revalidatePath("/teams");
    redirect(`/teams/${slug}?${q}`);
  };
  if (!mayEditTeam(viewer, team)) return back(`error=${encodeURIComponent("Only the team's chair, vice chair or a portal admin can change this.")}`);
  const check = checkTeamInfo({ description: String(form.get("description") ?? ""), chatUrl: String(form.get("chatUrl") ?? "") });
  if (!check.ok) return back(`error=${encodeURIComponent(check.error)}`);
  const teamInfo = { ...(s.teamInfo ?? {}) };
  if (check.info.description || check.info.chatUrl) teamInfo[team.group] = check.info;
  else delete teamInfo[team.group];
  await store.save({ ...s, teamInfo, updatedAt: new Date().toISOString(), updatedBy: viewer.email });
  back("ok=1");
}
