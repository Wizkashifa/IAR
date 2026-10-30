import type { ReactNode } from "react";
import type { Steps } from "@/lib/steps";
import { Crumb } from "./Crumb";
import { Icon } from "./Icon";
import { Note } from "./Note";
import { RequestBar } from "./RequestBar";
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
   * Everything else the person looking can do, at the end of the page after
   * the request: notes and reasons, Send back, Decline, Withdraw. Quiet or
   * destructive ones (Withdraw, Cancel) last.
   */
  actions?: ReactNode;
  /**
   * The one main action, in a bar stuck to the bottom of the screen while the
   * request is read: `label` says what's needed ("Needs your approval"),
   * `main` is the primary button. A button outside its form submits it with
   * `form="<the form's id>"`. On phones it takes the bottom bar's place.
   */
  bar?: { label?: ReactNode; main: ReactNode };
  /**
   * The main action's own panel, when it needs something typed or chosen
   * (a payment reference, an answer, what was fixed): its fields and its
   * button, titled by what it does ("Record the payment"). It comes last, just
   * above the bar, and the bar's button is then a link to it
   * (`href="#request-decide"`).
   */
  decide?: { title: string; body: ReactNode };
  /** The request itself, then comments and history. */
  main: ReactNode;
  /** Details, checks, calendar. Below the main column on phones. */
  side?: ReactNode;
  /** Portal admins only, at the very end: deleting the request. */
  admin?: ReactNode;
};

/**
 * One layout for every request page (events, purchases, marketing, tickets):
 * breadcrumb, title and status, the step bar with "What happens next", any
 * notes, then the request in a main column and its details in a side column,
 * and the other actions after it. The main action waits in a bar at the
 * bottom right, so people decide after reading, with the button in reach.
 */
export function RequestPage({ crumb, id, title, pills, lead, steps, next, sent, notes, actions, bar, decide, main, side, admin }: RequestPageProps) {
  const leadText = (lead ?? []).filter(Boolean).join(" · ");
  return (
    <div className={styles.page}>
      <Crumb trail={[crumb]} here={<span className={styles.id}>{id}</span>} />

      {sent && (
        <Note tone="ok">
          <strong>Sent.</strong> {next || "You'll be notified when it moves."}
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

      <div className={side ? styles.issue : undefined}>
        <div className={styles.main}>{main}</div>
        {side && <aside className={styles.side}>{side}</aside>}
      </div>

      {actions && (
        <section id="request-actions" className={`${styles.panel} ${styles.actions}`} aria-labelledby={bar ? "request-actions-title" : undefined} aria-label={bar ? undefined : "Actions"}>
          {bar && (
            <h2 id="request-actions-title" className={styles.actionsTitle}>
              Other options
            </h2>
          )}
          {actions}
        </section>
      )}
      {admin}

      {decide && (
        <section id="request-decide" className={`${styles.panel} ${styles.actions}`} aria-labelledby="request-decide-title">
          <h2 id="request-decide-title" className={styles.actionsTitle}>
            {decide.title}
          </h2>
          {decide.body}
        </section>
      )}

      {bar && (
        <RequestBar label={bar.label} more={Boolean(actions)}>
          {bar.main}
        </RequestBar>
      )}
    </div>
  );
}
