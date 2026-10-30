import type { ReactNode } from "react";
import type { Card } from "@/lib/cards";
import { cardRow, type RowData, type RowOptions } from "@/lib/card-row";
import type { Grouped, NeedsViewer } from "@/lib/needs-you";
import { rowStatusText } from "@/lib/status-text";
import { EmptyState } from "./EmptyState";
import { Icon } from "./Icon";
import { CardRow } from "./ItemRow";
import { Panel } from "./Panel";
import styles from "./ItemList.module.css";
import { Chips, type Chip } from "./Chips";

/** List rows for these requests, for the person looking (lib/card-row.ts). */
export function rowsFor(cards: Card[], viewer: NeedsViewer, o: RowOptions = {}): RowData[] {
  return cards.map((c) => {
    const row = cardRow(c, viewer, "", o);
    return { ...row, status: rowStatusText(c, row.state) };
  });
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
 * A list of requests in a panel: a title and count, optional filter chips,
 * then section bands ("Needs you 3") with their rows. Done is
 * folded. Empty sections are left out; with nothing at all, `empty` shows.
 */
export function ItemList({
  title,
  right,
  sections,
  rows,
  chips,
  empty = "Nothing here yet.",
  emptyTitle,
  emptyAction,
}: {
  title: ReactNode;
  /** Defaults to "N open": everything not folded. */
  right?: ReactNode;
  sections?: Section[];
  /** A plain list with no bands, instead of sections. */
  rows?: RowData[];
  chips?: Chip[];
  empty?: ReactNode;
  /** A title over the empty sentence ("All caught up"). */
  emptyTitle?: string;
  emptyAction?: ReactNode;
}) {
  const secs = sections ?? [{ label: "", rows: rows ?? [] }];
  const open = secs.filter((s) => !s.folded).reduce((n, s) => n + s.rows.length, 0);
  const total = secs.reduce((n, s) => n + s.rows.length, 0);
  const banded = Boolean(sections);
  return (
    <div className={styles.wrap}>
      {chips && chips.length > 0 && (
        <div className={styles.bar}>
          <Chips label="Show" chips={chips} />
        </div>
      )}
      <Panel title={title} right={right ?? <span>{open} open</span>} flush>
        {total === 0 ? (
          <EmptyState title={emptyTitle} action={emptyAction}>{empty}</EmptyState>
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

/** One banded section of rows built by the page itself (What's stuck adds a reminder button to each): the same band as ItemList's. */
export function Band({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <section aria-label={label}>
      <h3 className={styles.band}>
        {label} <span>{count}</span>
      </h3>
      <ul className={styles.list}>{children}</ul>
    </section>
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
