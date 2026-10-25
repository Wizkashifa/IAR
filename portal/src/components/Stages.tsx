import type { Step, StepFlag } from "@/lib/next-step";
import { Pill } from "./Pill";
import styles from "./Stages.module.css";

/**
 * The step bar on a request page (lib/next-step.ts `stepsFor`): thin bars,
 * green for steps done, gold for the one it's on, faded for steps skipped.
 * Scrolls sideways on a narrow phone instead of squeezing the labels.
 */
export function Stages({ steps, flag }: { steps: Step[]; flag?: StepFlag }) {
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
      {flag && (
        <div className={styles.flag}>
          <Pill tone={flag.tone} dot>
            {flag.label}
          </Pill>
        </div>
      )}
    </div>
  );
}
