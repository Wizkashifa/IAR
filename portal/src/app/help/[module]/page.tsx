import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/Button";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { WHO_TO_ASK, helpGuide } from "@/lib/help";
import { findModule } from "@/lib/modules";
import { requireViewer } from "@/lib/viewer";
import { GUIDE_ICON } from "../icons";
import styles from "../help.module.css";
import { Crumb } from "@/components/Crumb";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  const guide = helpGuide((await params).module);
  return { title: guide ? `Help: ${guide.title}` : "Help" };
}

/** One guide in full: each part as numbered steps, then who to ask. */
export default async function HelpGuidePage({ params }: { params: Promise<{ module: string }> }) {
  await requireViewer();
  const guide = helpGuide((await params).module);
  if (!guide) notFound();
  const page = guide.module ? (findModule(guide.module)?.name ?? guide.title) : guide.title;

  return (
    <div className="stack loose">
      <Crumb trail={[{ href: "/help", label: "Help" }]} here={guide.title} />
      <ModuleHead
        title={guide.title}
        lead={guide.summary}
        actions={
          <>
            <Button href={guide.href} icon={GUIDE_ICON[guide.key]}>
              Go to {page}
            </Button>
            <Button href={`/feedback?from=${encodeURIComponent(`/help/${guide.key}`)}`} icon="message">
              Send feedback about this guide
            </Button>
          </>
        }
      />
      <div className={styles.sections}>
        {guide.sections.map((s) => (
          <Panel key={s.heading} title={s.heading}>
            <ol className={styles.steps}>
              {s.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Panel>
        ))}
        <Panel title="Still stuck?">
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
