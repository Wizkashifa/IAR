import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DEV_PERSONAS, isDevAuth } from "@/lib/dev";
import { rolesFromGroups } from "@/lib/org";
import { choosePersona } from "./actions";

export const dynamic = "force-dynamic";

export default async function DevPage() {
  if (!isDevAuth()) notFound();
  const current = (await cookies()).get("dev_persona")?.value ?? DEV_PERSONAS[0].id;
  return (
    <>
      <h1>Choose a sample user</h1>
      <p className="lead">Local development only. Each sample user belongs to different groups, so the home page shows different tools.</p>
      <div className="personas">
        {DEV_PERSONAS.map((p) => (
          <form key={p.id} action={choosePersona} className={`persona${p.id === current ? " current" : ""}`}>
            <input type="hidden" name="persona" value={p.id} />
            <div>
              <strong>{p.name}</strong> <span className="sub">· {p.title}</span>
              <div className="sub">Roles: {rolesFromGroups(p.groups).join(", ")}</div>
            </div>
            <button className="button secondary" type="submit">
              {p.id === current ? "Current" : "Use"}
            </button>
          </form>
        ))}
      </div>
    </>
  );
}
