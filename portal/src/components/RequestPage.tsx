import Link from "next/link";
import type { ReactNode } from "react";
import type { Steps } from "@/lib/steps";
import { Icon } from "./Icon";
import { Note } from "./Note";
import { Stages } from "./Stages";
import styles from "./RequestPage.module.css";

export type RequestPageProps = {
  /** Where "back" goes: the module's page. */
  crumb: { href: string; label: string };
  id: string;
  title: ReactNode;
  /** Status pills, shown right next to the title. */
  pills?: ReactNode;
  /** The lead line, joined with " · ": kind, committee, who asked, date or amount. */
  lead?: (string | false | null | undefined)[];
  /** From stepsFor. */
  steps?: Steps;
  /** From nextStepText: one sentence, written for the person looking. */
  next?: string;
  /** Just sent: says so at the top, with what happens next. */
  sent?: boolean;
  /** Notes under the steps: sent back, flags, out of office. */
  notes?: ReactNode;
  /**
   * The buttons for the person looking, in one row. Put the main action first
   * and quiet or destructive ones (Withdraw, Cancel) last.
   */
  actions?: ReactNode;
  /** The request itself, then comments and history. */
  main: ReactNode;
  /** Details, checks, calendar. Below the main column on phones. */
  side?: ReactNode;
};

/**
 * One layout for every request page (events, purchases, marketing, tickets),
 * as in the demo: breadcrumb, title and status, the step bar with "What
 * happens next", any notes, the action row, then the request in a main column
 * and its details in a side column.
 */
export function RequestPage({ crumb, id, title, pills, lead, steps, next, sent, notes, actions, main, side }: RequestPageProps) {
  const leadText = (lead ?? []).filter(Boolean).join(" · ");
  return (
    <div className={styles.page}>
      <nav className={styles.crumb} aria-label="Breadcrumb">
        <Link href={crumb.href}>{crumb.label}</Link>
        <span aria-hidden="true"> / </span>
        <span className={styles.id}>{id}</span>
      </nav>

      {sent && (
        <Note tone="ok">
          <strong>Sent.</strong> {next || "You'll get a notification when it moves."}
        </Note>
      )}

      <header className={styles.head}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {pills && <div className={styles.pills}>{pills}</div>}
        </div>
        {leadText && <p className="lead">{leadText}</p>}
      </header>

      {(steps?.steps.length || next) && (
        <section className={styles.panel} aria-label="Where it stands">
          {steps && steps.steps.length > 0 && <Stages steps={steps.steps} flag={steps.flag} />}
          {next && !sent && (
            <p className={steps?.steps.length ? styles.next : `${styles.next} ${styles.alone}`}>
              <Icon name="chevR" />
              <span>
                <strong>What happens next:</strong> {next}
              </span>
            </p>
          )}
        </section>
      )}

      {notes}

      {actions && <section className={`${styles.panel} ${styles.actions}`} aria-label="Actions">{actions}</section>}

      <div className={side ? styles.issue : undefined}>
        <div className={styles.main}>{main}</div>
        {side && <aside className={styles.side}>{side}</aside>}
      </div>
    </div>
  );
}
