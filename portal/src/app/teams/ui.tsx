import { ItemRow } from "@/components/ItemRow";
import { Pill } from "@/components/Pill";
import type { NameResolver } from "@/lib/names";
import type { TeamEntry } from "@/lib/whos-who";
import styles from "./teams.module.css";
import { plural } from "@/lib/text";

/** "Chair: Ali Hassan · Vice chair: Sara Khan", or who to ask when a team has no chair yet. */
export function leadersLine(t: TeamEntry, names: NameResolver): string {
  const list = (es: string[]) => es.map(names).join(", ");
  const parts = [t.chairs.length ? `${t.chairs.length > 1 ? "Chairs" : "Chair"}: ${list(t.chairs)}` : "No chair yet", ...(t.vices.length ? [`Vice chair: ${list(t.vices)}`] : [])];
  return parts.join(" · ");
}

/** One committee or team in a list: its name, leaders and what it handles. The whole row opens the team. */
export function TeamRow({ team, names, mine }: { team: TeamEntry; names: NameResolver; mine?: boolean }) {
  return (
    <ItemRow
      state="plain"
      href={`/teams/${team.slug}`}
      title={
        <>
          {team.name}{" "}
          {mine && <Pill tone="accent">You&apos;re on it</Pill>}
        </>
      }
      sub={leadersLine(team, names)}
      extra={team.description}
      right={<span className={styles.count}>{plural(team.memberCount, "person", "people")}</span>}
    />
  );
}
