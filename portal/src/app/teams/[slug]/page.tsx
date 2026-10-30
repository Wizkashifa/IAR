import { FlashNote } from "@/components/FlashNote";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/Button";
import { Field, FormActions } from "@/components/Field";
import { KeyValue } from "@/components/KeyValue";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { directory } from "@/lib/groups";
import { nameResolver } from "@/lib/names";
import { portalSettings } from "@/lib/portal-settings";
import { requireViewer } from "@/lib/viewer";
import { mayEditTeam, requestRoutes, seesMembers, teamEntries } from "@/lib/whos-who";
import { saveTeamInfo } from "../actions";
import styles from "../teams.module.css";
import { Crumb } from "@/components/Crumb";

export const dynamic = "force-dynamic";

async function findTeam(slug: string) {
  const [dir, settings] = await Promise.all([directory(), portalSettings()]);
  return { dir, team: teamEntries(dir, settings.teamInfo).find((t) => t.slug === slug) };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { team } = await findTeam((await params).slug);
  return { title: team ? `${team.name} · Who's who` : "Who's who" };
}

export default async function TeamPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string; edit?: string }> }) {
  const [{ slug }, { ok, error, edit }] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer();
  const { dir, team } = await findTeam(slug);
  if (!team) notFound();

  const showMembers = seesMembers(viewer, team.group);
  const members = showMembers
    ? (dir.teams.find((t) => t.email.toLowerCase() === team.group)?.members ?? []).filter((m) => m.type === "USER" && m.role === "MEMBER").map((m) => m.email.toLowerCase())
    : [];
  const names = await nameResolver([...team.chairs, ...team.vices, ...team.directors, ...members]);
  const you = viewer.email.toLowerCase();
  const person = (e: string) => (e === you ? `${names(e)} (you)` : names(e));
  const list = (es: string[]) =>
    es.length ? (
      <span className={styles.people}>
        {es.map((e) => (
          <a key={e} href={`mailto:${e}`} title={e}>
            {person(e)}
          </a>
        ))}
      </span>
    ) : undefined;
  const editing = mayEditTeam(viewer, team);
  // While the description form is open, its Save is the page's one main button.
  const formOpen = editing && Boolean(edit || !team.description);
  const routes = requestRoutes(team.slug);

  return (
    <>
      <Crumb trail={[{ href: "/teams", label: "Who's who" }]} here={team.pillar} />
      <ModuleHead
        title={team.name}
        lead={team.description ?? "What this team handles hasn't been written yet."}
        actions={
          <>
            {team.chatUrl && (
              <Button href={team.chatUrl} target="_blank" icon="message">
                Open the team&apos;s Chat space
              </Button>
            )}
            {routes.map((r, i) => (
              <Button key={r.href} href={r.href} variant={i === 0 && !formOpen ? "primary" : "default"} icon="plus">
                {r.label}
              </Button>
            ))}
          </>
        }
      />
      <FlashNote ok={ok ? "saved" : undefined} error={error} messages={{ saved: "Saved. Everyone sees the new description in Who's Who." }} />

      <div className={styles.columns}>
        <div className="stack">
          <Panel title="Who leads it">
            <KeyValue
              items={[
                { label: team.chairs.length > 1 ? "Chairs" : "Chair", value: list(team.chairs) ?? "No chair yet. Ask the IAR office." },
                { label: "Vice chair", value: list(team.vices) },
                { label: team.directors.length > 1 ? "Directors" : "Director", value: list(team.directors) },
                { label: "People on it", value: `${team.memberCount}` },
              ]}
            />
          </Panel>

          <Panel title="Members" right={showMembers ? members.length : undefined}>
            {showMembers ? (
              members.length ? (
                <ul className={styles.members}>
                  {members.map((e) => (
                    <li key={e}>
                      <a href={`mailto:${e}`} title={e}>
                        {person(e)}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Only the leaders so far.</p>
              )
            ) : (
              <p className="hint">The full list is shown to the team itself and the IAR office. To ask the team for something, contact its chair or send a request.</p>
            )}
          </Panel>
        </div>

        <div className="stack">
          <Panel title="How to ask this team">
            <p className={styles.plain}>
              {team.slug === "marketing"
                ? "Send a marketing request: graphics, signs, announcements, webpages and more. Someone on the team picks up new requests as they come in."
                : team.slug === "maintenance" || team.slug === "tech"
                  ? "Send an AV/IT/Maintenance request. It goes to the right team, and you can follow it until it's done."
                  : "Most things go through an event request (a program or a room) or a payment request (paying for something). For anything else, contact the chair."}
            </p>
          </Panel>

          {editing &&
            (edit || !team.description ? (
              <Panel title="What the team handles" right="You can change this">
                <form action={saveTeamInfo} className="stack">
                  <input type="hidden" name="slug" value={team.slug} />
                  <Field label="In a sentence or two" hint="Shown in Who's who and searched when someone asks “who handles…?”. Up to 300 characters." htmlFor="team-desc">
                    <textarea id="team-desc" name="description" rows={3} maxLength={300} defaultValue={team.description ?? ""} />
                  </Field>
                  <Field label="Google Chat space link (optional)" hint="Open the team's space in Google Chat and copy its link." htmlFor="team-chat">
                    <input id="team-chat" type="url" name="chatUrl" defaultValue={team.chatUrl ?? ""} placeholder="https://chat.google.com/room/…" maxLength={500} />
                  </Field>
                  <FormActions sticky={false}>
                    {edit && (
                      <Button href={`/teams/${team.slug}`} variant="quiet">
                        Cancel
                      </Button>
                    )}
                    <Button type="submit" variant="primary">
                      Save
                    </Button>
                  </FormActions>
                </form>
              </Panel>
            ) : (
              <Panel title="What the team handles">
                <p className="hint">You can change what the team handles and its Chat link.</p>
                <Button href={`/teams/${team.slug}?edit=1`} size="small">
                  Change
                </Button>
              </Panel>
            ))}
        </div>
      </div>
    </>
  );
}
