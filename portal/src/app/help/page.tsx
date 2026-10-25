import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { HELP_GUIDES, WHO_TO_ASK, type HelpGuide } from "@/lib/help";
import { visibleModules } from "@/lib/modules";
import { requireViewer } from "@/lib/viewer";
import { WHATS_NEW } from "@/lib/whats-new";
import { GUIDE_ICON } from "./icons";
import styles from "./help.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Help" };

/** The guides for what this person can use: Team Queues only for team members. */
function guidesFor(roles: Parameters<typeof visibleModules>[0]): HelpGuide[] {
  const live = new Set(visibleModules(roles).filter((m) => m.status === "live").map((m) => m.id));
  return HELP_GUIDES.filter((g) => !g.module || live.has(g.module) || (g.key === "teams" && live.has("run-sheet")));
}

export default async function HelpPage() {
  const viewer = await requireViewer();
  const guides = guidesFor(viewer.roles);
  const recent = WHATS_NEW.slice(0, 3);

  return (
    <>
      <ModuleHead title="Help" lead="Step-by-step guides for each part of the portal, in plain words." />

      <ul className={styles.guides} aria-label="Guides">
        {guides.map((g) => (
          <li key={g.key}>
            <Link href={`/help/${g.key}`} className={styles.guide}>
              <Icon name={GUIDE_ICON[g.key]} size="lg" className={styles.guideIcon} />
              <span>
                <span className={styles.guideTitle}>{g.title}</span>
                <span className={styles.guideText}>{g.summary}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className={styles.stack}>
        <Panel title="What's new" right={<Link href="/help/whats-new">See all</Link>}>
          <ul className={styles.news}>
            {recent.map((e) => (
              <li key={e.title} className={styles.newsItem}>
                <span className={styles.newsTitle}>{e.title}</span>
                <p className={styles.newsText}>{e.text}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Who to ask">
          <ul className={styles.plain}>
            {WHO_TO_ASK.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className={styles.more}>
            <Link href="/feedback?from=%2Fhelp">Send feedback</Link>
          </p>
        </Panel>
      </div>
    </>
  );
}
