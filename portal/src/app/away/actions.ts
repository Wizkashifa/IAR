"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkAway } from "@/lib/away";
import { deliver } from "@/lib/notifications";
import { DEV_DOMAIN } from "@/lib/dev";
import { ORG } from "@/lib/org";
import { peopleStore } from "@/lib/people";
import { requireViewer } from "@/lib/viewer";
import { todayLocal } from "@/lib/dates";
import type { FormState } from "@/components/FormErrors";


const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export async function saveAway(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const people = await peopleStore();
  const delegate = String(form.get("delegate") ?? "").trim().toLowerCase();
  const r = checkAway(
    { from: String(form.get("from") ?? ""), until: String(form.get("until") ?? ""), delegate, note: String(form.get("note") ?? "") },
    { email: viewer.email, name: viewer.name },
    { today: todayLocal(), domain: viewer.dev ? DEV_DOMAIN : ORG.domain, now: new Date().toISOString(), delegateAway: delegate ? await people.getAway(delegate) : null },
  );
  if (!r.ok) return { errors: r.errors };

  const before = await people.getAway(viewer.email);
  await people.setAway(r.away);
  // Tell the person covering, once per new handoff (not on every small edit).
  if (!before || before.delegate !== r.away.delegate || before.from !== r.away.from || before.until !== r.away.until) {
    await deliver(
      [{
        to: { email: r.away.delegate },
        href: "/",
        text: `${viewer.name} asked you to cover their approvals from ${fmtDay(r.away.from)} to ${fmtDay(r.away.until)}${r.away.note ? `: “${r.away.note}”` : "."}`,
        alert: true,
        delegable: false,
      }],
      viewer.email,
    );
  }
  revalidatePath("/", "layout");
  redirect("/away?ok=saved");
}

export async function clearAway(): Promise<void> {
  const viewer = await requireViewer();
  const people = await peopleStore();
  const before = await people.getAway(viewer.email);
  await people.clearAway(viewer.email);
  if (before) {
    await deliver([{ to: { email: before.delegate }, href: "/", text: `${viewer.name} is back. You're no longer covering their approvals.`, alert: false, delegable: false }], viewer.email);
  }
  revalidatePath("/", "layout");
  redirect("/away?ok=cleared");
}
