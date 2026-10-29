import Link from "next/link";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Field";
import { FileDrop } from "@/components/FileDrop";
import { Icon } from "@/components/Icon";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { todayLocal } from "@/lib/dates";
import { cardStore } from "@/lib/cards";
import { eventContext } from "@/lib/events/context";
import { requireViewer } from "@/lib/viewer";
import { ticketActor } from "@/lib/tickets/context";
import { scheduleStore } from "@/lib/tickets/schedule-store";
import { workToday } from "@/lib/tickets/today";
import { STATUS_LABEL, TEAM_LABEL, URGENCY } from "@/lib/tickets/types";
import { type TicketActor, type TicketCard, lateText, permission, teamsOf } from "@/lib/tickets/workflow";
import { actFromToday } from "../actions";
import { FLASH, fmtDay } from "../ui";
import { FlashNote } from "@/components/FlashNote";
import styles from "./today.module.css";
import { Disclosure } from "@/components/Disclosure";

export const dynamic = "force-dynamic";
export const metadata = { title: "My work today" };

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];

type Ctx = { actor: TicketActor; now: Date; today: string; roomHref: (room: string) => string | null; showTeam: boolean };

/** One ticket as a big, tappable card with the next one-tap actions. */
function WorkCard({ card, ctx }: { card: TicketCard; ctx: Ctx }) {
  const t = card.ticket;
  const can = (a: "assign" | "start" | "wait" | "resolve") => permission(card, ctx.actor, a).ok;
  const late = lateText(card, ctx.now, ctx.today);
  const preventive = t.kind === "preventive";
  const roomHref = ctx.roomHref(t.room);
  const hidden = (action: string) => (
    <>
      <input type="hidden" name="id" value={card.id} />
      <input type="hidden" name="expected" value={card.updatedAt} />
      <input type="hidden" name="action" value={action} />
    </>
  );
  const working = t.status === "in_progress";
  const startLabel = t.status === "waiting_parts" ? "Parts are in: start again" : "Start";
  return (
    <li id={card.id} className={`${styles.card} ${late || t.urgency === "urgent" ? styles.hot : ""}`}>
      <div className={styles.head}>
        <Link href={`/it-maintenance/${card.id}`} className={styles.title}>
          {card.title}
        </Link>
        <span className={styles.id}>{card.id}</span>
      </div>
      <div className={styles.pills}>
        <Pill tone={working ? "info" : t.status === "waiting_parts" ? "warn" : "neutral"} dot>
          {STATUS_LABEL[t.status]}
        </Pill>
        {t.urgency !== "normal" && <Pill tone={t.urgency === "urgent" ? "bad" : t.urgency === "high" ? "warn" : "neutral"}>{URGENCY[t.urgency].label}</Pill>}
        {late && <Pill tone="bad">{late}</Pill>}
        {!late && t.dueDate === ctx.today && <Pill tone="warn">Due today</Pill>}
        {!late && t.dueDate && t.dueDate > ctx.today && <Pill>Due {fmtDay(t.dueDate)}</Pill>}
      </div>
      <p className={styles.where}>
        <Icon name="building" size="sm" />
        <span>
          {roomHref ? (
            <Link href={roomHref} title="What's booked in this room today">
              {t.room}
            </Link>
          ) : (
            t.room
          )}
          {t.equipment ? ` · ${t.equipment}` : ""}
          {ctx.showTeam ? ` · ${TEAM_LABEL[t.team]}` : ""}
        </span>
      </p>
      {!preventive && <p className={styles.who}>From {t.reporterName}</p>}

      <div className={styles.actions}>
        {!t.assigneeEmail && can("assign") && (
          <form action={actFromToday}>
            {hidden("assign")}
            <Button type="submit" full>
              I&apos;ll take it
            </Button>
          </form>
        )}
        {!working && can("start") && (
          <form action={actFromToday}>
            {hidden("start")}
            <Button type="submit" icon="zap" full>
              {startLabel}
            </Button>
          </form>
        )}
        {working && can("resolve") && (
          <Disclosure summary={preventive ? "Mark done" : "Mark fixed"} open divided className={styles.tap}>
            <form action={actFromToday} className="stack">
              {hidden("resolve")}
              <Field label="What did you do?" required hint={preventive ? undefined : "The person who reported it is asked to check."}>
                <textarea name="note" rows={2} maxLength={2000} required placeholder={preventive ? "Changed the filters" : "Replaced the cartridge"} />
              </Field>
              <FileDrop name="photos" label="Photo (optional)" accept={PHOTO_TYPES} multiple={false} maxFiles={1} camera />
              <Button type="submit" icon="check" full>
                {preventive ? "Mark done" : "Mark fixed"}
              </Button>
            </form>
          </Disclosure>
        )}
        {t.status !== "waiting_parts" && t.assigneeEmail && can("wait") && (
          <Disclosure summary="Waiting on parts" divided className={styles.tap}>
            <form action={actFromToday} className="stack">
              {hidden("wait")}
              <Field label="What's on order, and when is it due?">
                <input name="note" maxLength={300} placeholder="Strike plate from the locksmith, due Thursday" />
              </Field>
              <Button type="submit" full>
                Waiting on parts
              </Button>
            </form>
          </Disclosure>
        )}
      </div>
    </li>
  );
}

function Section({ title, cards, ctx, empty }: { title: string; cards: TicketCard[]; ctx: Ctx; empty: string }) {
  return (
    <Panel title={title} right={<span>{cards.length}</span>}>
      {cards.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        <ul className={styles.list}>
          {cards.map((c) => (
            <WorkCard key={c.id} card={c} ctx={ctx} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default async function MyWorkToday({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const teams = teamsOf(actor);
  const now = new Date();
  const today = todayLocal(now);

  if (teams.length === 0) {
    return (
      <div className="stack">
        <ModuleHead accent="it" title="My work today" />
        <EmptyState icon="wrench" action={<Button href="/it-maintenance">Go to IT &amp; Maintenance</Button>}>
          This page is for the IT Services and Facility Maintenance teams. To report a problem, use AV/IT/Maintenance.
        </EmptyState>
      </div>
    );
  }

  const [open, schedules, ev] = await Promise.all([(await cardStore()).listByType("ticket"), (await scheduleStore()).list(), eventContext()]);
  const work = workToday(open, actor, now, today, schedules);
  const roomHref = (room: string) => {
    const r = ev.bookable.find((x) => x.name === room);
    return r ? `/events?room=${encodeURIComponent(r.id)}&date=${today}` : null;
  };
  const ctx: Ctx = { actor, now, today, roomHref, showTeam: teams.length > 1 };
  const nothing = work.mine.length + work.untaken.length + work.preventive.length === 0;

  return (
    <div className="stack">
      <ModuleHead accent="it"
        title="My work today"
        lead={`${fmtDay(today)}. Yours first, then what nobody on your team has taken, then this week's preventive work.`}
        actions={
          <Button href="/it-maintenance?view=team" icon="tasks">
            Team board
          </Button>
        }
      />
      <FlashNote ok={sp.ok} error={sp.error} messages={FLASH} />
      {nothing && <p className="hint">Nothing waiting. Quiet day, alhamdulillah.</p>}
      <Section title="Assigned to you" cards={work.mine} ctx={ctx} empty="Nothing assigned to you right now." />
      <Section title="Nobody has taken these yet" cards={work.untaken} ctx={ctx} empty="Every request has someone on it." />
      <Section title="Preventive work this week" cards={work.preventive} ctx={ctx} empty="No preventive work due this week." />
      {work.upcoming.length > 0 && (
        <Panel title="Opening later this week" right={<Link href="/it-maintenance/schedules">Schedules</Link>}>
          <ul className={styles.upcoming}>
            {work.upcoming.map((s) => (
              <li key={s.id}>
                <strong>{s.name}</strong>
                <span className={styles.who}>
                  {fmtDay(s.next)} · {s.room}
                  {s.equipment ? ` · ${s.equipment}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
