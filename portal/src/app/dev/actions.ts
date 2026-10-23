"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEV_PERSONAS, isDevAuth } from "@/lib/dev";

export async function choosePersona(formData: FormData) {
  if (!isDevAuth()) redirect("/");
  const id = String(formData.get("persona"));
  if (DEV_PERSONAS.some((p) => p.id === id)) {
    (await cookies()).set("dev_persona", id, { httpOnly: true, sameSite: "lax", path: "/" });
  }
  redirect("/");
}

/** Run the daily job now, as Cloud Scheduler does each morning in production. */
export async function runDailyNow() {
  if (!isDevAuth()) redirect("/");
  const { runDaily } = await import("@/lib/daily");
  const results = await runDaily();
  redirect(`/dev?daily=${encodeURIComponent(results.map((r) => `${r.job}: ${r.summary}`).join(" · "))}`);
}
