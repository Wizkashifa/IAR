import type { Step, StepFlag } from "@/lib/steps";
import { Pill } from "./Pill";
import styles from "./Stages.module.css";

/**
 * The step bar on a request page (lib/next-step.ts `stepsFor`): thin bars,
 * green for steps done, gold for the one it's on, faded for steps skipped.
 * On a phone every bar fits on one line and a single line names the current
 * step ("Step 6 of 7: Close-out"); the step labels stay for screen readers.
 */
export function Stages({ steps, flag }: { steps: Step[]; flag?: StepFlag }) {
  const at = steps.findIndex((s) => s.state === "now");
  return (
    <div className={styles.wrap}>
      <ol className={styles.stages} aria-label="Steps">
        {steps.map((s, i) => (
          <li key={`${s.label}-${i}`} className={[styles.stage, styles[s.state]].filter(Boolean).join(" ")} aria-current={s.state === "now" ? "step" : undefined}>
            <span className={styles.bar} aria-hidden="true" />
            <span className={styles.label}>
              {s.label}
              {s.state === "done" && <span className="sr-only"> (done)</span>}
              {s.state === "skip" && <span className="sr-only"> (skipped)</span>}
            </span>
          </li>
        ))}
      </ol>
      {at >= 0 && (
        <p className={styles.summary} aria-hidden="true">
          Step {at + 1} of {steps.length}: <strong>{steps[at].label}</strong>
        </p>
      )}
      {flag && (
        <div className={styles.flag}>
          <Pill tone={flag.tone} status>
            {flag.label}
          </Pill>
        </div>
      )}
    </div>
  );
}
