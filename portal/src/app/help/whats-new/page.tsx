import type { Metadata } from "next";
import Link from "next/link";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { requireViewer } from "@/lib/viewer";
import { WHATS_NEW, type WhatsNew } from "@/lib/whats-new";
import { fmtDay } from "@/lib/format";
import styles from "../help.module.css";
import { Crumb } from "@/components/Crumb";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "What's new" };

/** Everything new in the portal, newest first, one panel per day. */
export default async function WhatsNewPage() {
  await requireViewer();
  const days = new Map<string, WhatsNew[]>();
  for (const e of WHATS_NEW) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  const ordered = [...days.entries()].sort(([a], [b]) => (a < b ? 1 : -1));

  return (
    <div className="stack loose">
      <div className="stack tight">
        <Crumb trail={[{ href: "/help", label: "Help" }]} here="What's new" />
        <ModuleHead title="What's new" lead="Changes to the portal you'll notice, newest first." />
      </div>
      <div className={styles.sections}>
        {ordered.map(([date, items]) => (
          <Panel key={date} title={fmtDay(date)}>
            <ul className={styles.news}>
              {items.map((e) => (
                <li key={e.title} className={styles.newsItem}>
                  <span className={styles.newsTitle}>{e.title}</span>
                  <p className={styles.newsText}>
                    {e.text}
                    {e.href && (
                      <>
                        {" "}
                        <Link href={e.href}>Try it</Link>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  );
}
