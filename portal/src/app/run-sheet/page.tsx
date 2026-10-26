import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { cardStore } from "@/lib/cards";
import { nameResolver } from "@/lib/names";
import { requireViewer } from "@/lib/viewer";
import { campusesOf, runSheetRows } from "@/lib/runsheet";
import { eventContext } from "@/lib/events/context";
import { timeText } from "@/lib/events/series";
import { type EventCard, isEventCard } from "@/lib/events/workflow";
import { fmtDay } from "@/lib/format";
import { RoomCheckCell } from "../events/ops-ui";
import { RoomDay } from "../events/RoomDay";
import styles from "../events/events.module.css";
import { PrintButton } from "./PrintButton";
import { isDate } from "@/lib/dates";
import { Pill } from "@/components/Pill";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Daily Run Sheet" };

const MESSAGES: Record<string, string> = {
  "check-ok": "Room check saved.",
  "check-problem": "Room check saved. The requester and the IAR office have been told about the problem.",
};

const SEES = ["office", "facilities", "security", "admins"];

export default async function RunSheetPage({ searchParams }: { searchParams: Promise<{ date?: string; campus?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  if (!viewer.roles.some((r) => SEES.includes(r))) {
    return (
      <div className="stack loose">
        <ModuleHead title="Daily Run Sheet" />
        <Panel>
          <EmptyState icon="book">The run sheet is for the IAR office, facilities and security.</EmptyState>
        </Panel>
      </div>
    );
  }
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
  const byId = new Map<string, EventCard>(events.map((c) => [c.id, c]));
  const rows = runSheetRows(events, busy, ctx.rooms, date, campus);
  const eventCount = rows.filter((r) => r.kind === "event").length;
  const back = `/run-sheet?date=${date}${campus ? `&campus=${encodeURIComponent(campus)}` : ""}`;
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
      {sp.ok && MESSAGES[sp.ok] && <Note tone="ok">{MESSAGES[sp.ok]}</Note>}
      {sp.error && <Note tone="bad">{sp.error}</Note>}
      <div className={styles.noprint}>
        <RoomDay options={campuses.map((c) => ({ id: c, name: c }))} value={campus} param="campus" label="Campus" date={date} today={ctx.today} />
      </div>

      <Panel
        title={`${campus ?? "IAR"} · ${fmtDay(date)}`}
        right={`${eventCount} event${eventCount === 1 ? "" : "s"} · ${rows.length - eventCount} other calendar entr${rows.length - eventCount === 1 ? "y" : "ies"}`}
        flush
      >
        {rows.length === 0 ? (
          <EmptyState icon="calendar">Nothing on the room calendars this day.</EmptyState>
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
                    {r.security.length > 0 && <div className="hint">Security: {r.security.join(" ")}</div>}
                    {byId.get(r.cardId) && (
                      <div className={styles.cells}>
                        <RoomCheckCell card={byId.get(r.cardId)!} date={date} when="before" check={r.checks.before} roles={viewer.actingRoles} back={back} />
                        <RoomCheckCell card={byId.get(r.cardId)!} date={date} when="after" check={r.checks.after} roles={viewer.actingRoles} back={back} />
                      </div>
                    )}
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
                    <div className="hint">{r.rooms.join(", ")} · {r.entry === "standing" ? "Standing hold (room policy)" : "Calendar entry"}</div>
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
