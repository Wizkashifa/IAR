import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/Button";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { HELP_GUIDES, WHO_TO_ASK, type HelpGuide } from "@/lib/help";
import { visibleModules } from "@/lib/modules";
import { requireViewer } from "@/lib/viewer";
import { WHATS_NEW } from "@/lib/whats-new";
import { GUIDE_ICON } from "./icons";
import styles from "./help.module.css";
import { LinkCard, LinkCards } from "@/components/LinkCard";
import { findModule } from "@/lib/modules";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Help" };

/** The guides for what this person can use. */
function guidesFor(roles: Parameters<typeof visibleModules>[0]): HelpGuide[] {
  const live = new Set(visibleModules(roles).filter((m) => m.status === "live").map((m) => m.id));
  return HELP_GUIDES.filter((g) => !g.module || live.has(g.module));
}

export default async function HelpPage() {
  const viewer = await requireViewer();
  const guides = guidesFor(viewer.roles);
  const recent = WHATS_NEW.slice(0, 3);

  return (
    <div className="stack loose">
      <ModuleHead
        title="Help"
        lead="Step-by-step guides for each part of the portal, in plain words."
        actions={
          <Button href="/feedback?from=%2Fhelp" icon="message">
            Send feedback
          </Button>
        }
      />

      <LinkCards label="Guides">
        {guides.map((g) => (
          <LinkCard key={g.key} href={`/help/${g.key}`} icon={GUIDE_ICON[g.key]} accent={g.module ? findModule(g.module)?.accent : undefined} title={g.title}>
            {g.summary}
          </LinkCard>
        ))}
      </LinkCards>

      <div className={styles.sections}>
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
        </Panel>
      </div>
    </div>
  );
}
