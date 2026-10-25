import Link from "next/link";
import type { ReactNode } from "react";
import { ROW_TONE, type RowData, type RowState } from "@/lib/card-row";
import { Icon } from "./Icon";
import { Pill } from "./Pill";
import styles from "./ItemRow.module.css";

export type ItemRowProps = {
  title: ReactNode;
  id?: string;
  href?: string | null;
  /** The supporting line. */
  sub?: ReactNode;
  /** Who has it now; shown in bold after the supporting line. */
  who?: ReactNode;
  /** The status in words, as a pill in the row's tone. */
  status?: string;
  /** Anything else on the right, instead of or after the status. */
  right?: ReactNode;
  /** The coloured edge: act (gold), wait (blue), done (green), bad (red). */
  state?: RowState;
  /** Before the title: a checkbox for picking several (finance batch work). It sits outside the link. */
  lead?: ReactNode;
};

/**
 * One request in a list, as in the demo: title and number, a supporting line
 * with who has it, the status on the right, and an edge coloured by who has to
 * act. The whole row opens the request.
 */
export function ItemRow({ title, id, href, sub, who, status, right, state = "wait", lead }: ItemRowProps) {
  const body = (
    <>
      <div className={styles.text}>
        <div className={styles.t}>
          {title}
          {id && <span className={styles.id}>{id}</span>}
        </div>
        {(sub || who) && (
          <div className={styles.s}>
            {sub}
            {sub && who && " · "}
            {who && <strong>{who}</strong>}
          </div>
        )}
      </div>
      {(status || right) && (
        <div className={styles.r}>
          {status && (
            <Pill tone={ROW_TONE[state]} dot>
              {status}
            </Pill>
          )}
          {right}
        </div>
      )}
    </>
  );
  const cls = `${styles.item} ${styles[state]}${lead ? ` ${styles.withLead}` : ""}`;
  return (
    <li className={cls}>
      {lead && <div className={styles.lead}>{lead}</div>}
      {href ? (
        <Link href={href} className={styles.link}>
          {body}
          <Icon name="chevR" className={styles.chev} />
        </Link>
      ) : (
        <div className={styles.link}>{body}</div>
      )}
    </li>
  );
}

/** An ItemRow from lib/card-row.ts `cardRow`. */
export function CardRow({ row, lead }: { row: RowData; lead?: ReactNode }) {
  return <ItemRow title={row.title} id={row.id} href={row.href} sub={row.sub} who={row.who} status={row.status} state={row.state} lead={lead} />;
}
