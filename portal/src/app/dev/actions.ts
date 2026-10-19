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
