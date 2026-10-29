import Link from "next/link";
import { DataTable, cell } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { ItemRow, Rows } from "@/components/ItemRow";
import { KeyValue } from "@/components/KeyValue";
import { Panel, PanelFoot } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { Stat, Stats } from "@/components/Stat";
import type { Card } from "@/lib/cards";
import { todayLocal } from "@/lib/dates";
import { eventContext } from "@/lib/events/context";
import { queueItems } from "@/lib/events/queues";
import { roomById } from "@/lib/events/rooms";
import { timeText } from "@/lib/events/series";
import { TASK_TEAMS, TEAM_NAME as TASK_TEAM_NAME } from "@/lib/events/tasks";
import { isEventCard } from "@/lib/events/workflow";
import { fmtDay, fmtMoney, fmtMonth } from "@/lib/format";
import { daysText, eventTurnaround, eventsThisWeek, moneyThisMonth, paymentTurnaround, ticketHealth, waitingByKind } from "@/lib/overview";
import { statementStore } from "@/lib/purchases/statements";
import { isPurchaseCard } from "@/lib/purchases/workflow";
import { stuckItems } from "@/lib/stuck";
import { TEAM_NAME as TICKET_TEAM_NAME } from "@/lib/tickets/types";
import { isTicketCard } from "@/lib/tickets/workflow";
import { needsContext } from "@/lib/waiting";
import styles from "./measures.module.css";

/** Whole dollars for the headline tiles; the panels below keep the cents. */
const dollars = (n: number) => fmtMoney(Math.round(n)).replace(/\.00$/, "");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Events that are still with someone (as on What's stuck): approved ones wait on nobody until close-out. */
const WAITING_EVENT = new Set(["submitted", "in_review", "changes_requested", "close_out"]);

/**
 * The top of Portal measures: the whole portal right now, for executives.
 * Uses the requests the page has already read; the sums are lib/overview.ts.
 * Every number links to where the work happens.
 */
export async function RightNow({ cards }: { cards: Card[] }) {
  const now = new Date();
  const today = todayLocal(now);
  const month = today.slice(0, 7);
  const [ctx, evCtx, statements] = await Promise.all([needsContext(), eventContext(), statementStore().then((s) => s.list(1))]);

  const purchases = cards.filter(isPurchaseCard);
  const events = cards.filter(isEventCard);
  const tickets = cards.filter(isTicketCard);
  const waiting = stuckItems(
    cards.filter((c) => c.type !== "event" || WAITING_EVENT.has(c.status)),
    now.toISOString(),
    ctx,
  );
  const kinds = waitingByKind(waiting);
  const overWeek = waiting.filter((i) => i.days > 7);
  const oldest = waiting.reduce((m, i) => Math.max(m, i.days), 0);
  const money = moneyThisMonth(purchases, month);
  const week = eventsThisWeek(events, today);
  const health = ticketHealth(tickets, now, today);
  const tasks = TASK_TEAMS.map((team) => {
    const items = queueItems(events, team, today);
    return { team, open: items.length, overdue: items.filter((i) => i.overdue).length };
  });
  const pay = paymentTurnaround(purchases, now);
  const approve = eventTurnaround(events, now);
  const statement = statements[0];
  const openTickets = health.reduce((s, t) => s + t.open, 0);
  const lateTickets = health.reduce((s, t) => s + t.late, 0);
  const roomsOf = (ids: string[]) => ids.map((r) => roomById(evCtx.rooms, r)?.name ?? r).join(", ") || "Off-site";

  return (
    <section className="stack" aria-labelledby="right-now">
      <h2 id="right-now">Right now</h2>
      <Stats label="Headline numbers">
        <Stat label="Waiting on someone" value={waiting.length} note={`Across ${plural(kinds.filter((k) => k.open).length, "module")}`} href="/stuck" />
        <Stat label="Waiting over a week" value={overWeek.length} note={oldest ? `Longest: ${plural(oldest, "day")}` : "Nothing waiting"} tone={overWeek.length ? "warn" : "ok"} href="/stuck" />
        <Stat label={`Paid in ${fmtMonth(month)}`} value={dollars(money.paid)} note={plural(money.paidCount, "payment")} href="/purchases/finance?tab=books" />
        <Stat label="Approved, to pay" value={dollars(money.toPay)} note={plural(money.toPayCount, "request")} href="/purchases/finance" />
        <Stat label="Events this week" value={week.length} note={`${week.filter((w) => !w.approved).length} still in review`} href="/calendar" />
        <Stat label="Open tickets" value={openTickets} note={lateTickets ? `${lateTickets} late` : "None late"} tone={lateTickets ? "bad" : "plain"} href="/it-maintenance?view=team" />
      </Stats>

      <div className={styles.cols}>
        <Panel title="What's waiting" right={plural(waiting.length, "request")} flush>
          <DataTable caption="Requests waiting on someone, by kind">
            <thead>
              <tr>
                <th>Kind</th>
                <th className={cell.num}>Waiting</th>
                <th className={cell.num}>Over a week</th>
                <th className={cell.num}>Longest</th>
              </tr>
            </thead>
            <tbody>
              {kinds.map((k) => (
                <tr key={k.type}>
                  <td data-label="Kind">
                    <Link href={`/stuck?kind=${k.type}`}>{k.label}</Link>
                  </td>
                  <td data-label="Waiting" className={cell.num}>
                    {k.open}
                  </td>
                  <td data-label="Over a week" className={cell.num}>
                    {k.overWeek ? <Pill tone="warn">{k.overWeek}</Pill> : 0}
                  </td>
                  <td data-label="Longest" className={cell.num}>
                    {k.open ? plural(k.oldestDays, "day") : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <PanelFoot>
            <Link href="/stuck">See every waiting request, and send a reminder</Link>
          </PanelFoot>
        </Panel>

        <Panel title={`Money in ${fmtMonth(month)}`} flush>
          <div className={styles.kv}>
            <KeyValue
              items={[
                { label: "Paid", value: `${fmtMoney(money.paid)} (${plural(money.paidCount, "payment")})` },
                { label: "Approved, to pay", value: `${fmtMoney(money.toPay)} (${plural(money.toPayCount, "request")})` },
                { label: "Still in review", value: `${fmtMoney(money.inReview)} (${plural(money.inReviewCount, "request")})` },
                { label: "Latest card statement", value: statement ? `${fmtMoney(statement.total)} (${fmtMonth(statement.month)}, ${plural(statement.cards.length, "card")})` : "None in yet" },
              ]}
            />
          </div>
          {money.byCommittee.length > 0 ? (
            <DataTable compact caption="Paid this month by committee">
              <thead>
                <tr>
                  <th>Paid by committee</th>
                  <th className={cell.num}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {money.byCommittee.slice(0, 6).map((c) => (
                  <tr key={c.name}>
                    <td data-label="Committee">{c.name}</td>
                    <td data-label="Amount" className={cell.num}>
                      {fmtMoney(c.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <EmptyState icon="receipt">Nothing paid yet this month.</EmptyState>
          )}
          <PanelFoot>
            <Link href="/purchases/finance">Finance desk</Link> · <Link href="/purchases/finance/statement">Card statements</Link>
          </PanelFoot>
        </Panel>
      </div>

      <Panel title="This week at IAR" right={plural(week.length, "event")} flush>
        {week.length === 0 ? (
          <EmptyState icon="calendar">No events requested for the next 7 days.</EmptyState>
        ) : (
          <Rows>
            {week.map(({ card, date, approved }) => (
              <ItemRow
                key={card.id}
                title={<Link href={`/events/${card.id}`}>{card.title}</Link>}
                id={card.id}
                sub={`${fmtDay(date)} · ${timeText(card.event.start)}–${timeText(card.event.end)} · ${roomsOf(card.event.rooms)} · ${card.event.committeeName}`}
                state={approved ? "plain" : "wait"}
                right={approved ? <Pill tone="ok">Approved</Pill> : <Pill tone="info">Waiting for approval</Pill>}
              />
            ))}
          </Rows>
        )}
        <PanelFoot>
          <Link href="/calendar">Calendar</Link> · <Link href="/run-sheet">Today&apos;s run sheet</Link>
        </PanelFoot>
      </Panel>

      <div className={styles.cols}>
        <Panel title="Building and IT" right={plural(openTickets, "open ticket")} flush>
          <DataTable caption="Open tickets by team">
            <thead>
              <tr>
                <th>Team</th>
                <th className={cell.num}>Open</th>
                <th className={cell.num}>Nobody on it</th>
                <th className={cell.num}>Late</th>
                <th className={cell.num}>High or urgent</th>
              </tr>
            </thead>
            <tbody>
              {health.map((t) => (
                <tr key={t.team}>
                  <td data-label="Team">
                    <Link href={`/it-maintenance?view=team&team=${t.team}`}>{TICKET_TEAM_NAME[t.team]}</Link>
                  </td>
                  <td data-label="Open" className={cell.num}>
                    {t.open}
                  </td>
                  <td data-label="Nobody on it" className={cell.num}>
                    {t.nobody ? <Pill tone="warn">{t.nobody}</Pill> : 0}
                  </td>
                  <td data-label="Late" className={cell.num}>
                    {t.late ? <Pill tone="bad">{t.late}</Pill> : 0}
                  </td>
                  <td data-label="High or urgent" className={cell.num}>
                    {t.urgent}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>

        <Panel title="Event tasks" right="For approved events" flush>
          <DataTable caption="Open event tasks by team">
            <thead>
              <tr>
                <th>Team</th>
                <th className={cell.num}>Open</th>
                <th className={cell.num}>Overdue</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.team}>
                  <td data-label="Team">
                    <Link href={`/queues?team=${t.team}`}>{TASK_TEAM_NAME[t.team]}</Link>
                  </td>
                  <td data-label="Open" className={cell.num}>
                    {t.open}
                  </td>
                  <td data-label="Overdue" className={cell.num}>
                    {t.overdue ? <Pill tone="bad">{t.overdue}</Pill> : 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      </div>

      <Panel title="Then and now" right="Last 90 days" flush>
        <div className={styles.kv}>
          <KeyValue
            items={[
              { label: "Payment requests", value: `${daysText(pay)} from sending to paid, typically${pay.count ? ` (${plural(pay.count, "payment")})` : ""}` },
              { label: "Event requests", value: `${daysText(approve)} from sending to final approval, typically${approve.count ? ` (${plural(approve.count, "event")})` : ""}` },
              { label: "Waiting over a week now", value: plural(overWeek.length, "request") },
            ]}
          />
        </div>
        <PanelFoot>
          Before the portal, the old Requisition Form had 12 purchase requests waiting 7 to 44 days at last count, room bookings were confirmed by email within a week, and one
          event could take three forms on two platforms.
        </PanelFoot>
      </Panel>
    </section>
  );
}
