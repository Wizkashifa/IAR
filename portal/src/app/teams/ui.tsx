import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { NameResolver } from "@/lib/names";
import type { TeamEntry } from "@/lib/whos-who";
import styles from "./teams.module.css";

/** "Chair: Ali Hassan · Vice chair: Sara Khan", or who to ask when a team has no chair yet. */
export function leadersLine(t: TeamEntry, names: NameResolver): string {
  const list = (es: string[]) => es.map(names).join(", ");
  const parts = [t.chairs.length ? `${t.chairs.length > 1 ? "Chairs" : "Chair"}: ${list(t.chairs)}` : "No chair yet", ...(t.vices.length ? [`Vice chair: ${list(t.vices)}`] : [])];
  return parts.join(" · ");
}

/** One committee or team in a list: its name, leaders and what it handles. The whole row opens the team. */
export function TeamRow({ team, names, mine }: { team: TeamEntry; names: NameResolver; mine?: boolean }) {
  return (
    <Link href={`/teams/${team.slug}`} className={styles.row}>
      <span className={styles.text}>
        <span className={styles.name}>
          {team.name}
          {mine && <span className={styles.you}>You&apos;re on it</span>}
        </span>
        <span className={styles.sub}>{leadersLine(team, names)}</span>
        {team.description && <span className={styles.desc}>{team.description}</span>}
      </span>
      <span className={styles.count}>
        {team.memberCount} {team.memberCount === 1 ? "person" : "people"}
        <Icon name="chevR" size="sm" />
      </span>
    </Link>
  );
}
