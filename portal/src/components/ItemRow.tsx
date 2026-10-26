import Link from "next/link";
import type { ReactNode } from "react";
import { ROW_TONE, type RowData, type RowState } from "@/lib/card-row";
import { Icon, type IconName } from "./Icon";
import { Pill } from "./Pill";
import styles from "./ItemRow.module.css";

export type ItemRowProps = {
  title: ReactNode;
  id?: string;
  href?: string | null;
  /** The link opens outside the portal (a file in Google Drive), in a new tab. */
  external?: string;
  /** Instead of a link: the whole row is a button that posts this form (marking a notification read, then going to it). */
  submit?: { action: (form: FormData) => Promise<void>; fields: Record<string, string> };
  /** An icon before the title (a file's kind). */
  icon?: IconName;
  /** The supporting line. */
  sub?: ReactNode;
  /** Who has it now; shown in bold after the supporting line. */
  who?: ReactNode;
  /** More under the supporting line: a description, reasons, notes. */
  extra?: ReactNode;
  /** Things to notice, as gold pills under the title (an event's food, outside speaker, …). */
  flags?: string[];
  /** The status in words, as a pill in the row's tone. */
  status?: string;
  /** Anything else on the right, instead of or after the status. */
  right?: ReactNode;
  /** The coloured edge: act (gold), wait (blue), done (green), bad (red); "plain" for rows that aren't requests. */
  state?: RowState | "plain";
  /** Before the title: a checkbox for picking several (finance batch work). It sits outside the link. */
  lead?: ReactNode;
};

/**
 * One row in a list, as in the demo: title and number, a supporting line
 * with who has it, the status on the right, and an edge coloured by who has to
 * act. The whole row opens what it's about. Requests, files, teams, rooms and
 * notifications all use it, so every list in the portal reads the same.
 */
export function ItemRow({ title, id, href, external, submit, icon, sub, who, extra, flags, status, right, state = "wait", lead }: ItemRowProps) {
  const body = (
    <>
      {icon && <Icon name={icon} className={styles.icon} />}
      <div className={styles.text}>
        <div className={styles.t}>
          {title}
          {id && <span className={styles.id}>{id}</span>}
          {external && <span className="sr-only"> (opens in {external})</span>}
        </div>
        {(sub || who) && (
          <div className={styles.s}>
            {sub}
            {sub && who && " · "}
            {who && <strong>{who}</strong>}
          </div>
        )}
        {extra && <div className={styles.extra}>{extra}</div>}
        {flags && flags.length > 0 && (
          <div className={styles.flags}>
            {flags.map((f) => (
              <Pill key={f} tone="gold" small>
                {f}
              </Pill>
            ))}
          </div>
        )}
      </div>
      {(status || right) && (
        <div className={styles.r}>
          {status && state !== "plain" && (
            <Pill tone={ROW_TONE[state]} dot>
              {status}
            </Pill>
          )}
          {right}
        </div>
      )}
    </>
  );
  const opens = Boolean(href || submit);
  const linkCls = [styles.link, icon && styles.withIcon, !opens && styles.still].filter(Boolean).join(" ");
  const chev = <Icon name="chevR" className={styles.chev} />;
  const cls = [styles.item, opens && styles.opens, state !== "plain" && styles[state], lead && styles.withLead].filter(Boolean).join(" ");
  return (
    <li className={cls}>
      {lead && <div className={styles.lead}>{lead}</div>}
      {submit ? (
        <form action={submit.action} className={styles.form}>
          {Object.entries(submit.fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <button type="submit" className={linkCls}>
            {body}
            {chev}
          </button>
        </form>
      ) : href && external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={linkCls}>
          {body}
          {chev}
        </a>
      ) : href ? (
        <Link href={href} className={linkCls}>
          {body}
          {chev}
        </Link>
      ) : (
        <div className={linkCls}>{body}</div>
      )}
    </li>
  );
}

/** The list a set of rows sits in, inside a flush Panel. */
export function Rows({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {children}
    </ul>
  );
}

/** An ItemRow from lib/card-row.ts `cardRow`. */
export function CardRow({ row, lead }: { row: RowData; lead?: ReactNode }) {
  return <ItemRow title={row.title} id={row.id} href={row.href} sub={row.sub} who={row.who} status={row.status} state={row.state} flags={row.flags} lead={lead} />;
}
