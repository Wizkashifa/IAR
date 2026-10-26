import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { DEV_PERSONAS, devDirectory, isDevAuth } from "@/lib/dev";
import { rolesFromGroups } from "@/lib/org";
import { directedTeamGroups, membershipsOf, teamRoles } from "@/lib/teams";
import { devChatOutbox } from "@/lib/chat";
import { devOutbox } from "@/lib/mail";
import { fmtDateTime } from "../purchases/ui";
import { choosePersona, runDailyNow } from "./actions";
import { Button } from "@/components/Button";
import { Panel } from "@/components/Panel";
import { EmptyState } from "@/components/EmptyState";
import { ItemRow, Rows } from "@/components/ItemRow";
import { Note } from "@/components/Note";

export const dynamic = "force-dynamic";

export default async function DevPage({ searchParams }: { searchParams: Promise<{ daily?: string }> }) {
  if (!isDevAuth()) notFound();
  const { daily } = await searchParams;
  const current = (await cookies()).get("dev_persona")?.value ?? DEV_PERSONAS[0].id;
  const dir = devDirectory();
  const ROLE = { chair: "chair", vice: "vice chair", member: "member" } as const;
  return (
    <>
      <h1>Choose a sample user</h1>
      <p className="lead">Local development only. Each sample user belongs to different groups, so the home page shows different tools.</p>
      <Panel flush>
        <Rows label="Sample users">
          {DEV_PERSONAS.map((p) => (
            <ItemRow
              key={p.id}
              state={p.id === current ? "act" : "plain"}
              submit={{ action: choosePersona, fields: { persona: p.id } }}
              title={p.name}
              sub={p.title}
              extra={
                <>
                  Roles: {rolesFromGroups(p.groups, teamRoles(membershipsOf(dir, p.email))).join(", ")}
                  <br />
                  Teams: {membershipsOf(dir, p.email).map((m) => `${m.name} (${ROLE[m.role]})`).join(", ") || "none"}
                  {directedTeamGroups(dir, p.email).length > 0 && ` · Directs ${directedTeamGroups(dir, p.email).length} committees`}
                </>
              }
              right={p.id === current ? "Current" : "Use"}
            />
          ))}
        </Rows>
      </Panel>

      <h2>Daily job</h2>
      <p className="hint">In production, Cloud Scheduler runs this every morning: reminders, the morning digest, escalations and preventive maintenance tickets.</p>
      <form action={runDailyNow}>
        <Button type="submit">Run the daily job now</Button>
      </form>
      {daily && <Note tone="ok">{daily}</Note>}

      <h2>Google Chat messages the portal would have sent</h2>
      <p className="hint">Alerts go to whoever has to act next: a direct message to a person, or a post in a team&apos;s space. Nothing is sent in dev mode. Newest first; restart the dev server to clear.</p>
      {devChatOutbox().length === 0 ? (
        <Panel>
          <EmptyState>None yet. Submit or approve a request to see them.</EmptyState>
        </Panel>
      ) : (
        <Panel flush>
          <Rows>
            {devChatOutbox().map((m, i) => (
              <ItemRow key={i} state="plain" title={<><strong>{m.to}</strong>: {m.text}</>} sub={fmtDateTime(m.at)} />
            ))}
          </Rows>
        </Panel>
      )}

      <h2>Emails the portal would have sent</h2>
      <p className="hint">Email is only the fallback, for someone Chat can&apos;t reach yet. Nothing is emailed in dev mode.</p>
      {devOutbox().length === 0 ? (
        <Panel>
          <EmptyState>None.</EmptyState>
        </Panel>
      ) : (
        <Panel flush>
          <Rows>
            {devOutbox().map((m, i) => (
              <ItemRow key={i} state="plain" title={<><strong>To {m.to.join(", ")}</strong>: {m.subject}</>} sub={fmtDateTime(m.at)} extra={<span className="pre">{m.text}</span>} />
            ))}
          </Rows>
        </Panel>
      )}
    </>
  );
}
