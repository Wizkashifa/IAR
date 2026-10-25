import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { type AgendaItem, agendaBetween } from "@/lib/agenda";
import { rangeText } from "@/lib/agenda-core";
import { type CalendarView, byDay, committeesIn, filterAgenda, monthWeeks, stepView, viewRange, viewTitle, weekDays } from "@/lib/calendar-view";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { eventContext } from "@/lib/events/context";
import { dayText } from "@/lib/events/series";
import { Filters } from "./Filters";
import styles from "./calendar.module.css";
import { isDate } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar" };

type Query = { view?: string; date?: string; room?: string; committee?: string; standing?: string };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_MORE = 3;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const viewer = await requireViewer();
  const ctx = await eventContext();
  const view: CalendarView = q.view === "month" ? "month" : "week";
  const date = isDate(q.date) ? q.date : ctx.today;
  const { from, to } = viewRange(view, date);
  const [agenda, mine] = await Promise.all([agendaBetween(from, to, { standing: true }), (await cardStore()).listByOwner(viewer.email)]);
  const shown = filterAgenda(agenda, ctx.rooms, { roomId: q.room, committee: q.committee, standing: q.standing === "1" });
  const days = byDay(shown);
  const filtered = Boolean(q.room || q.committee);
  // Approved events are open to everyone; a request still in review only to its requester here.
  const own = new Set(mine.map((c) => c.id));
  const href = (a: AgendaItem) => (a.cardId && (!a.pending || own.has(a.cardId)) ? `/events/${a.cardId}` : undefined);

  const link = (o: Partial<Query>) => {
    const p = new URLSearchParams();
    const merged = { view, date, room: q.room, committee: q.committee, standing: q.standing, ...o };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "view" && v === "week")) p.set(k, v);
    return `/calendar?${p}`;
  };

  return (
    <div className="stack loose">
      <ModuleHead
        title="Calendar"
        lead="Everything booked in IAR's rooms, from the IAR calendar and the event requests. Looking for a free room? Find one and request it in one step."
        actions={
          <Button href="/calendar/find" variant="primary" icon="search">
            Find a room
          </Button>
        }
      />

      <Panel>
        <div className="stack">
          <div className={styles.bar}>
            <nav className={styles.views} aria-label="View">
              <Link href={link({ view: "week" })} className={styles.chip} aria-current={view === "week" ? "page" : undefined}>
                Week
              </Link>
              <Link href={link({ view: "month" })} className={styles.chip} aria-current={view === "month" ? "page" : undefined}>
                Month
              </Link>
            </nav>
            <h2 className={styles.title}>{viewTitle(view, date)}</h2>
            <div className={styles.nav}>
              <Button href={link({ date: stepView(view, date, -1) })} size="small">
                {view === "week" ? "Previous week" : "Previous month"}
              </Button>
              <Button href={link({ date: ctx.today })} size="small">
                Today
              </Button>
              <Button href={link({ date: stepView(view, date, 1) })} size="small">
                {view === "week" ? "Next week" : "Next month"}
              </Button>
            </div>
          </div>
          <Suspense fallback={null}>
            <Filters key={`${q.room ?? ""}|${q.committee ?? ""}|${q.standing ?? ""}`} rooms={ctx.bookable.map((r) => ({ id: r.id, name: r.name }))} committees={committeesIn(agenda)} />
          </Suspense>
        </div>
      </Panel>

      {view === "week" ? (
        <WeekView days={weekDays(date)} byDate={days} today={ctx.today} href={href} filtered={filtered} />
      ) : (
        <MonthView date={date} byDate={days} today={ctx.today} href={href} filtered={filtered} dayLink={(d) => link({ view: "week", date: d })} />
      )}

      <p className={styles.key}>
        <span className={styles.keyItem}>
          <i className={styles.dotBooked} /> Approved or on the IAR calendar
        </span>
        <span className={styles.keyItem}>
          <i className={styles.dotPending} /> Requested, waiting for approval
        </span>
        <span className={styles.keyItem}>
          <i className={styles.dotStanding} /> Prayers, school and other standing holds
        </span>
      </p>
    </div>
  );
}

function Entry({ a, href, compact }: { a: AgendaItem; href?: string; compact?: boolean }) {
  const kind = a.source === "standing" ? styles.standing : a.pending ? styles.pending : styles.booked;
  const body = (
    <>
      <span className={styles.time}>{rangeText(a.start, a.end)}</span>
      <span className={styles.what}>{a.title}</span>
      {!compact && (
        <span className={styles.where}>
          {a.rooms.join(", ")}
          {a.committee ? ` · ${a.committee}` : ""}
        </span>
      )}
      {!compact && a.pending && (
        <span>
          <Pill tone="info">Waiting for approval</Pill>
        </span>
      )}
    </>
  );
  return (
    <li className={`${styles.entry} ${kind}`}>
      {href ? (
        <Link href={href} className={styles.entryLink}>
          {body}
        </Link>
      ) : (
        <div className={styles.entryBody} title={compact ? `${a.title} · ${a.rooms.join(", ")}` : undefined}>
          {body}
        </div>
      )}
    </li>
  );
}

function WeekView({ days, byDate, today, href, filtered }: { days: string[]; byDate: Map<string, AgendaItem[]>; today: string; href: (a: AgendaItem) => string | undefined; filtered: boolean }) {
  const any = days.some((d) => byDate.get(d)?.length);
  return (
    <section aria-label="This week" className="stack">
      {!any && (
        <Panel>
          <EmptyState icon="calendar">Nothing booked this week{filtered ? " for this room or committee" : ""}.</EmptyState>
        </Panel>
      )}
      <ol className={styles.week}>
        {days.map((d) => {
          const items = byDate.get(d) ?? [];
          return (
            <li key={d} className={`${styles.day}${d === today ? ` ${styles.today}` : ""}${items.length ? "" : ` ${styles.emptyDay}`}`} aria-current={d === today ? "date" : undefined}>
              <h3 className={styles.dayHead}>
                {dayText(d)}
                {d === today && <span className={styles.todayTag}>Today</span>}
              </h3>
              {items.length ? (
                <ul className={styles.entries}>
                  {items.map((a) => (
                    <Entry key={a.key} a={a} href={href(a)} />
                  ))}
                </ul>
              ) : (
                <p className={styles.none}>Nothing booked</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function MonthView({ date, byDate, today, href, filtered, dayLink }: { date: string; byDate: Map<string, AgendaItem[]>; today: string; href: (a: AgendaItem) => string | undefined; filtered: boolean; dayLink: (d: string) => string }) {
  const weeks = monthWeeks(date);
  const month = date.slice(0, 7);
  const listDays = [...byDate.keys()].filter((d) => d.slice(0, 7) === month);
  return (
    <section aria-label="This month">
      <div className={styles.month} role="table" aria-label="Month">
        <div className={styles.monthRow} role="row">
          {DOW.map((d) => (
            <div key={d} className={styles.dow} role="columnheader">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((w) => (
          <div key={w[0].date} className={styles.monthRow} role="row">
            {w.map(({ date: d, inMonth }) => {
              const items = byDate.get(d) ?? [];
              return (
                <div key={d} role="cell" className={`${styles.cell}${inMonth ? "" : ` ${styles.out}`}${d === today ? ` ${styles.today}` : ""}`}>
                  <Link href={dayLink(d)} className={styles.num} aria-label={`${dayText(d)}: see the week`}>
                    {Number(d.slice(8))}
                  </Link>
                  {items.length > 0 && (
                    <ul className={styles.entries}>
                      {items.slice(0, MONTH_MORE).map((a) => (
                        <Entry key={a.key} a={a} href={href(a)} compact />
                      ))}
                    </ul>
                  )}
                  {items.length > MONTH_MORE && (
                    <Link href={dayLink(d)} className={styles.more}>
                      {items.length - MONTH_MORE} more
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Phones: the month as a list of the days that have something on. */}
      <div className={styles.monthList}>
        {listDays.length === 0 ? (
          <Panel>
            <EmptyState icon="calendar">Nothing booked this month{filtered ? " for this room or committee" : ""}.</EmptyState>
          </Panel>
        ) : (
          <ol className={styles.week}>
            {listDays.map((d) => (
              <li key={d} className={`${styles.day}${d === today ? ` ${styles.today}` : ""}`}>
                <h3 className={styles.dayHead}>
                  {dayText(d)}
                  {d === today && <span className={styles.todayTag}>Today</span>}
                </h3>
                <ul className={styles.entries}>
                  {(byDate.get(d) ?? []).map((a) => (
                    <Entry key={a.key} a={a} href={href(a)} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
