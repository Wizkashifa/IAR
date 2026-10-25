import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/Button";
import { DateField, TimeField } from "@/components/DateField";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { type RoomOption, freeRooms } from "@/lib/agenda";
import { MAX_PEOPLE, readNeed, requestHref } from "@/lib/calendar-view";
import { requireViewer } from "@/lib/viewer";
import { eventContext, mayBookRestricted } from "@/lib/events/context";
import { dayText, timeText } from "@/lib/events/series";
import styles from "../calendar.module.css";
import { Checkbox } from "@/components/Choices";
import { ItemRow, Rows } from "@/components/ItemRow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Find a room" };

type Query = { date?: string; start?: string; end?: string; people?: string; food?: string };

export default async function FindRoom({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const viewer = await requireViewer();
  const ctx = await eventContext();
  const { need, errors } = readNeed(q, ctx.today);
  const options = need ? await freeRooms(need, mayBookRestricted(viewer)) : [];
  const free = options.filter((o) => o.ok);
  const taken = options.filter((o) => !o.ok);

  return (
    <div className="stack loose">
      <div className="stack tight">
        <nav aria-label="Breadcrumb" className={styles.roomSub}>
          <Link href="/calendar">Calendar</Link> / Find a room
        </nav>
        <ModuleHead title="Find a room" lead="Say when and how many people, and see which rooms are free and fit. Setup and cleanup time (30 minutes each) is included in the check." />
      </div>

      <Panel>
        <form method="get" action="/calendar/find" className="stack">
          <div className={styles.findForm}>
            <DateField name="date" label="Date" defaultValue={q.date ?? ctx.today} min={ctx.today} required />
            <TimeField name="start" label="Starts" defaultValue={q.start ?? "18:30"} required />
            <TimeField name="end" label="Ends" defaultValue={q.end ?? "20:00"} required />
            <Field label="About how many people?" htmlFor="find-people" required>
              <input id="find-people" name="people" type="number" min={1} max={MAX_PEOPLE} defaultValue={q.people ?? "20"} required />
            </Field>
            <Checkbox name="food" value="1" defaultChecked={q.food === "1"}>Food will be served</Checkbox>
          </div>
          <div>
            <Button type="submit" variant="primary" icon="search">
              Find rooms
            </Button>
          </div>
        </form>
      </Panel>

      {errors.length > 0 && (
        <Note tone="bad">
          {errors.map((e) => (
            <span key={e}>{e} </span>
          ))}
        </Note>
      )}

      {need && (
        <>
          <Panel title={`Free on ${dayText(need.date)}, ${timeText(need.start)}–${timeText(need.end)}`} right={<span>{free.length} {free.length === 1 ? "room" : "rooms"}</span>} flush>
            {free.length === 0 ? (
              <EmptyState icon="calendar" action={<Button href="/calendar">See the calendar</Button>}>
                No room fits that time and size. Try another time, or fewer people.
              </EmptyState>
            ) : (
              <Rows>
                {free.map((o) => (
                  <RoomRow key={o.room.id} o={o} href={requestHref(need, o.room.id)} />
                ))}
              </Rows>
            )}
          </Panel>
          {taken.length > 0 && (
            <Panel flush>
              <details>
                <summary className={styles.takenSummary}>
                  {taken.length === 1 ? "Show the 1 room that doesn't fit or isn't free" : `Show the ${taken.length} rooms that don't fit or aren't free`}
                </summary>
                <Rows>
                  {taken.map((o) => (
                    <RoomRow key={o.room.id} o={o} />
                  ))}
                </Rows>
              </details>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function RoomRow({ o, href }: { o: RoomOption; href?: string }) {
  const r = o.room;
  const facts = [r.capacity ? `Holds ${r.capacity}` : "", r.building, r.food ? "Food allowed" : "No food"].filter(Boolean).join(" · ");
  const extra = (o.reasons.length > 0 || o.notes.length > 0) && (
    <>
      {o.reasons.length > 0 && (
        <ul className={styles.reasons}>
          {o.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {o.notes.map((n) => (
        <div key={n} className={styles.roomNote}>
          {n}
        </div>
      ))}
    </>
  );
  return (
    <ItemRow
      state={o.ok ? "done" : "plain"}
      title={r.name}
      sub={facts}
      extra={extra}
      right={
        href && (
          <Button href={href} size="small">
            Request this room
          </Button>
        )
      }
    />
  );
}
