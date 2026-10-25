import type { ReactNode } from "react";
import type { Card } from "@/lib/cards";
import { cardRow, type RowData, type RowOptions } from "@/lib/card-row";
import type { Grouped, NeedsViewer } from "@/lib/needs-you";
import { statusText } from "@/lib/status-text";
import { EmptyState } from "./EmptyState";
import { Icon } from "./Icon";
import { CardRow } from "./ItemRow";
import { Panel } from "./Panel";
import styles from "./ItemList.module.css";
import { Chips, type Chip } from "./Chips";

/** List rows for these requests, for the person looking (lib/card-row.ts). */
export function rowsFor(cards: Card[], viewer: NeedsViewer, o: RowOptions = {}): RowData[] {
  return cards.map((c) => cardRow(c, viewer, statusText(c), o));
}

/** Rows in three groups, from lib/needs-you.ts `groupForViewer`. */
export function groupedRows(g: Grouped, viewer: NeedsViewer, o: RowOptions = {}) {
  return { needsYou: rowsFor(g.needsYou, viewer, o), waiting: rowsFor(g.waiting, viewer, o), done: rowsFor(g.done, viewer, o) };
}

export type Section = { label: string; rows: RowData[]; /** Folded away (Done). */ folded?: boolean };

/** The demo's three groups: Needs you, Waiting on others, and Done folded away. */
export function sectionsOf(g: { needsYou: RowData[]; waiting: RowData[]; done: RowData[] }): Section[] {
  return [
    { label: "Needs you", rows: g.needsYou },
    { label: "Waiting on others", rows: g.waiting },
    { label: "Done", rows: g.done, folded: true },
  ];
}


/**
 * A list of requests in a panel: a title and count, optional filter chips and
 * colour key, then section bands ("Needs you 3") with their rows. Done is
 * folded. Empty sections are left out; with nothing at all, `empty` shows.
 */
export function ItemList({
  title,
  right,
  sections,
  rows,
  chips,
  legend,
  empty = "Nothing here yet.",
  emptyAction,
}: {
  title: ReactNode;
  /** Defaults to "N open": everything not folded. */
  right?: ReactNode;
  sections?: Section[];
  /** A plain list with no bands, instead of sections. */
  rows?: RowData[];
  chips?: Chip[];
  /** Show the key to the edge colours. */
  legend?: boolean;
  empty?: ReactNode;
  emptyAction?: ReactNode;
}) {
  const secs = sections ?? [{ label: "", rows: rows ?? [] }];
  const open = secs.filter((s) => !s.folded).reduce((n, s) => n + s.rows.length, 0);
  const total = secs.reduce((n, s) => n + s.rows.length, 0);
  const banded = Boolean(sections);
  return (
    <div className={styles.wrap}>
      {(chips?.length || legend) && (
        <div className={styles.bar}>
          {chips && chips.length > 0 && (
            <Chips label="Show" chips={chips} />
          )}
          {legend && <Legend />}
        </div>
      )}
      <Panel title={title} right={right ?? <span>{open} open</span>} flush>
        {total === 0 ? (
          <EmptyState action={emptyAction}>{empty}</EmptyState>
        ) : (
          secs
            .filter((s) => s.rows.length > 0)
            .map((s) =>
              s.folded ? (
                <details key={s.label} className={styles.folded}>
                  <summary className={styles.band}>
                    <Icon name="chevR" size="sm" className={styles.turn} />
                    {s.label} <span>{s.rows.length}</span>
                  </summary>
                  <Rows rows={s.rows} />
                </details>
              ) : (
                <section key={s.label || "all"} aria-label={s.label || undefined}>
                  {banded && (
                    <h3 className={styles.band}>
                      {s.label} <span>{s.rows.length}</span>
                    </h3>
                  )}
                  <Rows rows={s.rows} />
                </section>
              ),
            )
        )}
      </Panel>
    </div>
  );
}

function Rows({ rows }: { rows: RowData[] }) {
  return (
    <ul className={styles.list}>
      {rows.map((r) => (
        <CardRow key={r.id} row={r} />
      ))}
    </ul>
  );
}

/** What the edge colours mean. */
export function Legend() {
  return (
    <ul className={styles.legend} aria-label="What the colours mean">
      <li><i className={styles.kAct} />You need to act</li>
      <li><i className={styles.kWait} />Waiting on others</li>
      <li><i className={styles.kDone} />Approved or done</li>
      <li><i className={styles.kBad} />Stopped or late</li>
    </ul>
  );
}
