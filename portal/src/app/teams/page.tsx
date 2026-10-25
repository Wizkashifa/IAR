import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { directory } from "@/lib/groups";
import { nameResolver } from "@/lib/names";
import { portalSettings } from "@/lib/portal-settings";
import { requireViewer } from "@/lib/viewer";
import { byPillar, searchTeams, searchTopics, teamEntries } from "@/lib/whos-who";
import { TeamRow } from "./ui";
import styles from "./teams.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Who's who" };

export default async function WhosWhoPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 100);
  const viewer = await requireViewer();
  const [dir, settings] = await Promise.all([directory(), portalSettings()]);
  const teams = teamEntries(dir, settings.teamInfo);
  const names = await nameResolver(teams.flatMap((t) => [...t.chairs, ...t.vices, ...t.directors]));
  const mine = new Set(viewer.teams.map((m) => m.group.toLowerCase()));
  const yours = teams.filter((t) => mine.has(t.group));
  const hits = query ? searchTeams(teams, query) : [];
  const topics = query ? searchTopics(query) : [];

  return (
    <>
      <ModuleHead title="Who's who" lead="Every committee and team at IAR, who leads it, and how to ask it for something." />

      <form action="/teams" role="search" className={styles.search}>
        <label htmlFor="who-q" className="sr-only">
          Who handles…
        </label>
        <input id="who-q" type="search" name="q" defaultValue={query} placeholder="Who handles keys, the sound system, reimbursements…?" maxLength={100} />
        <Button type="submit" icon="search">
          Search
        </Button>
      </form>

      {query ? (
        <div className="stack">
          {topics.map((t) => (
            <Note key={t.href} tone="info">
              {t.text}{" "}
              <a href={t.href}>{t.label}</a>
            </Note>
          ))}
          <Panel title={`Teams for “${query}”`} right={<a href="/teams">Show all teams</a>} flush>
            {hits.length ? (
              <div className={styles.list}>
                {hits.map((t) => (
                  <TeamRow key={t.group} team={t} names={names} mine={mine.has(t.group)} />
                ))}
              </div>
            ) : (
              <EmptyState icon="search">
                No team matches that. Try another word, or ask the IAR office.
              </EmptyState>
            )}
          </Panel>
        </div>
      ) : teams.length === 0 ? (
        <Panel>
          <EmptyState icon="building">The committees and teams couldn&apos;t be read from Google Groups just now. Try again in a few minutes.</EmptyState>
        </Panel>
      ) : (
        <div className="stack">
          {yours.length > 0 && (
            <Panel title="Your committees and teams" right={yours.length} flush>
              <div className={styles.list}>
                {yours.map((t) => (
                  <TeamRow key={t.group} team={t} names={names} mine />
                ))}
              </div>
            </Panel>
          )}
          {byPillar(teams).map((g) => {
            const directors = [...new Set(g.teams.flatMap((t) => t.directors))];
            return (
              <Panel key={g.name} title={g.name} right={directors.length ? `Director: ${directors.map(names).join(", ")}` : `${g.teams.length} teams`} flush>
                <div className={styles.list}>
                  {g.teams.map((t) => (
                    <TeamRow key={t.group} team={t} names={names} mine={mine.has(t.group)} />
                  ))}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
