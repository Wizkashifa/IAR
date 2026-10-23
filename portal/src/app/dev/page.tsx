import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DEV_PERSONAS, devDirectory, isDevAuth } from "@/lib/dev";
import { rolesFromGroups } from "@/lib/org";
import { directedTeamGroups, membershipsOf, teamRoles } from "@/lib/teams";
import { devChatOutbox } from "@/lib/chat";
import { devOutbox } from "@/lib/mail";
import { fmtDateTime } from "../purchases/ui";
import { choosePersona } from "./actions";

export const dynamic = "force-dynamic";

export default async function DevPage() {
  if (!isDevAuth()) notFound();
  const current = (await cookies()).get("dev_persona")?.value ?? DEV_PERSONAS[0].id;
  const dir = devDirectory();
  const ROLE = { chair: "chair", vice: "vice chair", member: "member" } as const;
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
              <div className="sub">Roles: {rolesFromGroups(p.groups, teamRoles(membershipsOf(dir, p.email))).join(", ")}</div>
              <div className="sub">
                Teams: {membershipsOf(dir, p.email).map((m) => `${m.name} (${ROLE[m.role]})`).join(", ") || "none"}
                {directedTeamGroups(dir, p.email).length > 0 && ` · Directs ${directedTeamGroups(dir, p.email).length} committees`}
              </div>
            </div>
            <button className="button secondary" type="submit">
              {p.id === current ? "Current" : "Use"}
            </button>
          </form>
        ))}
      </div>

      <h2>Google Chat messages the portal would have sent</h2>
      <p className="note">Alerts go to whoever has to act next: a direct message to a person, or a post in a team&apos;s space. Nothing is sent in dev mode. Newest first; restart the dev server to clear.</p>
      {devChatOutbox().length === 0 ? (
        <div className="panel empty">None yet. Submit or approve a request to see them.</div>
      ) : (
        <ul className="notifs">
          {devChatOutbox().map((m, i) => (
            <li key={i} className="notif">
              <span className="t"><strong>{m.to}</strong>: {m.text}</span>
              <span className="sub">{fmtDateTime(m.at)}</span>
            </li>
          ))}
        </ul>
      )}

      <h2>Emails the portal would have sent</h2>
      <p className="note">Email is only the fallback, for someone Chat can&apos;t reach yet. Nothing is emailed in dev mode.</p>
      {devOutbox().length === 0 ? (
        <div className="panel empty">None.</div>
      ) : (
        <ul className="notifs">
          {devOutbox().map((m, i) => (
            <li key={i} className="notif">
              <span className="t"><strong>To {m.to.join(", ")}</strong>: {m.subject}</span>
              <span className="sub pre">{fmtDateTime(m.at)} · {m.text}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
