import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ItemList, rowsFor } from "@/components/ItemList";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import type { IconName } from "@/components/Icon";
import { agendaBetween, type AgendaItem } from "@/lib/agenda";
import { rangeText } from "@/lib/agenda-core";
import { isActive, isCurrentOrUpcoming } from "@/lib/away";
import { emailsIn, type RowData } from "@/lib/card-row";
import { datesText, SLOT_STATUS_LABEL } from "@/lib/events/slot-requests";
import { visibleModules } from "@/lib/modules";
import { nameResolver } from "@/lib/names";
import { peopleStore } from "@/lib/people";
import { STAGE_LABEL } from "@/lib/purchases/types";
import { approvingAsDirector, canViewDetail, coveringApprover, daysWaiting, isPurchaseCard } from "@/lib/purchases/workflow";
import { requireViewer } from "@/lib/viewer";
import { waitingFor } from "@/lib/waiting";
import { WhatsNewNote } from "@/components/WhatsNewNote";
import styles from "./home.module.css";
import { todayLocal } from "@/lib/dates";
import { ItemRow, Rows } from "@/components/ItemRow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home" };

const fmtDay = (d: string, weekday = false) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...(weekday ? { weekday: "short" as const } : {}), month: "short", day: "numeric", timeZone: "UTC" });

/** The quick buttons, for the live modules this person can use. */
const QUICK: { module: string; href: string; label: string; icon: IconName }[] = [
  { module: "events", href: "/events/new", label: "New event request", icon: "calendar" },
  { module: "purchase-requests", href: "/purchases/new", label: "New purchase request", icon: "receipt" },
  { module: "marketing-requests", href: "/marketing/new", label: "Marketing request", icon: "megaphone" },
  { module: "it-maintenance", href: "/it-maintenance/new", label: "AV/IT/Maintenance", icon: "wrench" },
];

/** "MPH A&B – full gym", or the first two rooms and how many more. */
const roomsText = (rooms: string[]) => (rooms.length === 0 ? "Off-site" : rooms.length <= 2 ? rooms.join(", ") : `${rooms.slice(0, 2).join(", ")} and ${rooms.length - 2} more`);

const SOURCE: Record<AgendaItem["source"], string> = { portal: "Portal request", standing: "Standing hold", calendar: "IAR calendar" };

export default async function Home() {
  const viewer = await requireViewer();
  const today = todayLocal();
  const modules = visibleModules(viewer.roles);
  const live = new Set(modules.filter((m) => m.status === "live").map((m) => m.id));
  const people = await peopleStore();
  const [waiting, myAway, coverFor, agenda] = await Promise.all([
    waitingFor(viewer),
    people.getAway(viewer.email),
    people.listAwayByDelegate(viewer.email),
    // Bookings only: prayers, school hours and other standing holds are on the run sheet.
    agendaBetween(today, today, { standing: false }).catch(() => null),
  ]);
  const { cards, asks, actor, ctx } = waiting;
  const names = await nameResolver([...emailsIn(cards), ...(actor.covering ?? []), ...(myAway ? [myAway.delegate] : [])]);
  const covering = coverFor.filter((a) => isCurrentOrUpcoming(a, today));
  const seeAll = viewer.roles.includes("admins");

  // Approvals say how long they've waited; a Social & Welfare request someone can approve but not open keeps its title private.
  const rows: RowData[] = rowsFor(cards, actor, { names, today, ctx }).map((r, i) => {
    const c = cards[i];
    if (!isPurchaseCard(c) || c.ownerEmail.toLowerCase() === actor.email) return r;
    const days = daysWaiting(c);
    const cover = coveringApprover(c, actor);
    const extra = [cover && `covering for ${names(cover)}`, approvingAsDirector(c, actor) && "as director"].filter(Boolean);
    const who = [`${STAGE_LABEL[c.purchase.stage]}: waiting ${days === 0 ? "since today" : `${days} day${days === 1 ? "" : "s"}`}`, ...extra].join(" · ");
    return canViewDetail(c, { ...actor, seeAll }) ? { ...r, who } : { ...r, title: "Social & Welfare request", sub: c.committee, who };
  });
  const askRows: RowData[] = asks.map((a) => ({
    id: a.id,
    title: `${a.requesterName} asks for ${a.hold.room}, ${datesText(a.dates)}`,
    href: `/events/${a.hold.cardId ?? a.fromCard}#asks`,
    sub: `Your booking: ${a.hold.label}`,
    who: `“${a.reason}”`,
    status: SLOT_STATUS_LABEL[a.status],
    state: "act",
  }));
  const allRows = [...askRows, ...rows];
  const quick = QUICK.filter((q) => live.has(q.module));
  const later = modules.filter((m) => m.status !== "live");
  const runSheet = live.has("run-sheet");
  const firstName = viewer.name.split(" ")[0];

  return (
    <div className="stack">
      <header className={styles.hero}>
        <h1 className="greet">Assalamu alaikum, {firstName}</h1>
        <p className="lead">Here&apos;s what needs you today, {fmtDay(today, true)}.</p>
        {quick.length > 0 && (
          <div className="row">
            {quick.map((q) => (
              <Button key={q.href} href={q.href} icon={q.icon}>
                {q.label}
              </Button>
            ))}
          </div>
        )}
      </header>
      <WhatsNewNote />

      {myAway &&isCurrentOrUpcoming(myAway, today) && (
        <Note>
          {isActive(myAway, today) ? "You're marked away" : `You'll be away from ${fmtDay(myAway.from)}`} until {fmtDay(myAway.until)}. {names(myAway.delegate)} is covering your approvals. <Link href="/away">Change</Link>
        </Note>
      )}
      {covering.map((a) => (
        <Note key={a.email}>
          {isActive(a, today) ? "You're covering" : `From ${fmtDay(a.from)} you'll cover`} approvals for {a.name} until {fmtDay(a.until)}
          {a.note ? `: “${a.note}”` : "."}
        </Note>
      ))}

      <ItemList
        title="Waiting on you"
        right={allRows.length > 0 ? <Pill tone="warn">{allRows.length}</Pill> : undefined}
        rows={allRows}
        empty="Nothing is waiting on you right now. When a request needs you, it shows up here and in Google Chat."
      />

      <Panel
        title={
          <>
            Today at IAR <span className={styles.date}>· {fmtDay(today, true)}</span>
          </>
        }
        right={runSheet ? <Button href="/run-sheet" size="small">Printable version</Button> : undefined}
        flush
      >
        {agenda === null ? (
          <EmptyState icon="calendar">The IAR calendar couldn&apos;t be read just now. Try again in a minute.</EmptyState>
        ) : agenda.length === 0 ? (
          <EmptyState icon="calendar">Nothing booked at IAR today.</EmptyState>
        ) : (
          <Rows>
            {agenda.map((a) => (
              <ItemRow
                key={a.key}
                state="plain"
                title={
                  <>
                    {a.title} {a.pending && <Pill tone="info">Waiting for approval</Pill>}
                  </>
                }
                sub={`${rangeText(a.start, a.end)} · ${roomsText(a.rooms)} · ${a.committee ?? SOURCE[a.source]}`}
              />
            ))}
          </Rows>
        )}
      </Panel>

      {later.length > 0 && (
        <Panel title="Coming later" level={2} flush>
          <Rows>
            {later.map((m) => (
              <ItemRow key={m.id} state="plain" title={m.name} href={m.href} sub={m.summary} />
            ))}
          </Rows>
        </Panel>
      )}
    </div>
  );
}
