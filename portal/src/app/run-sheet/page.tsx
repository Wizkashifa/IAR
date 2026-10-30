import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { cardStore } from "@/lib/cards";
import { nameResolver } from "@/lib/names";
import { requireViewer } from "@/lib/viewer";
import { campusesOf, runSheetRows } from "@/lib/runsheet";
import { eventContext } from "@/lib/events/context";
import { timeText } from "@/lib/events/series";
import { isEventCard } from "@/lib/events/workflow";
import { fmtDay } from "@/lib/format";
import { RoomDay } from "../events/RoomDay";
import styles from "../events/events.module.css";
import { PrintButton } from "./PrintButton";
import { isDate } from "@/lib/dates";
import { Pill } from "@/components/Pill";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Daily Run Sheet" };

export default async function RunSheetPage({ searchParams }: { searchParams: Promise<{ date?: string; campus?: string }> }) {
  const sp = await searchParams;
  await requireViewer();
  const ctx = await eventContext();
  const date = isDate(sp.date) ? sp.date : ctx.today;
  const campuses = campusesOf(ctx.rooms);
  const campus = campuses.includes(sp.campus ?? "") ? sp.campus! : campuses[0];
  const here = ctx.rooms.filter((r) => (r.building || "Other rooms") === campus);
  const [cards, busy] = await Promise.all([
    (await cardStore()).listByType("event", ["approved", "close_out"]),
    here.length ? ctx.calendar.listBusy(here.map((r) => ({ roomId: r.id, calendarId: r.calendarId })), date, date) : Promise.resolve([]),
  ]);
  const events = cards.filter(isEventCard);
  const rows = runSheetRows(events, busy, ctx.rooms, date, campus);
  const eventCount = rows.filter((r) => r.kind === "event").length;
  const names = await nameResolver(rows.flatMap((r) => (r.kind === "event" ? [r.contact] : [])));

  return (
    <div className="stack loose">
      <div className={styles.noprint}>
        <ModuleHead
          title="Daily Run Sheet"
          lead="What's happening where, from approved events and the room calendars. Each group sets up and cleans up its own event."
          actions={<PrintButton />}
        />
      </div>
      <div className={styles.noprint}>
        <RoomDay options={campuses.map((c) => ({ id: c, name: c }))} value={campus} param="campus" label="Campus" date={date} today={ctx.today} />
      </div>

      <Panel
        title={`${campus ?? "IAR"} · ${fmtDay(date)}`}
        right={`${eventCount} event${eventCount === 1 ? "" : "s"} · ${rows.length - eventCount} other calendar entr${rows.length - eventCount === 1 ? "y" : "ies"}`}
        flush
      >
        {rows.length === 0 ? (
          <EmptyState>Nothing on the room calendars this day.</EmptyState>
        ) : (
          <ol className={styles.sheet}>
            {rows.map((r, i) =>
              r.kind === "event" ? (
                <li key={`e${r.cardId}`} className={`${styles.entry} ${styles.ev}`}>
                  <div>
                    <div className={styles.time}>{timeText(r.start)}–{timeText(r.end)}</div>
                    <div className="hint">Event {timeText(r.eventStart)}–{timeText(r.eventEnd)}</div>
                    {(r.setup > 0 || r.teardown > 0) && <div className="hint">{r.setup} min setup, {r.teardown} min cleanup</div>}
                    {r.afterHours && <Pill tone="warn" small>After hours</Pill>}
                  </div>
                  <div>
                    <Link href={`/events/${r.cardId}`} className={styles.program}>{r.title}</Link>
                    <div className="hint">{r.rooms.join(", ")} · {r.committee} · {r.cardId}{r.series ? " · series" : ""}{r.closeOut ? " · closing out" : ""}</div>
                    <div className="hint">Contact: {names(r.contact)} · {r.attendance} people</div>
                  </div>
                  <div>
                    <div>{r.setupNotes || <span className="hint">No special setup</span>}</div>
                    {r.av && <div className="hint">A/V: {r.av}</div>}
                    {r.notes.length > 0 && <div className="hint">{r.notes.join(" ")}</div>}
                  </div>
                </li>
              ) : (
                <li key={`c${i}`} className={`${styles.entry} ${styles.cal}`}>
                  <div>
                    <div className={styles.time}>{timeText(r.start)}–{timeText(r.end)}</div>
                    {r.afterHours && <Pill tone="warn" small>After hours</Pill>}
                  </div>
                  <div>
                    <div className={styles.program}>{r.title}</div>
                    <div className="hint">{r.rooms.join(", ")} · Calendar entry</div>
                  </div>
                  <div className="hint">On the IAR calendar, not booked through the portal.</div>
                </li>
              ),
            )}
          </ol>
        )}
      </Panel>
    </div>
  );
}
