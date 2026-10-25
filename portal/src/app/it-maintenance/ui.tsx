import Link from "next/link";
import { Note } from "@/components/Note";
import { Pill } from "@/components/Pill";
import type { NameOf } from "@/lib/steps";
import { TEAM_LABEL, URGENCY, type TicketStatus, type Urgency } from "@/lib/tickets/types";
import { type TicketCard, lateText } from "@/lib/tickets/workflow";
import styles from "./tickets.module.css";

export { fmtDate, fmtDateTime, fmtDay } from "../ui";

export const FLASH: Record<string, string> = {
  reported: "Thank you. The team has been told, and you'll hear from the portal as it moves.",
  assign: "Assigned.",
  start: "Marked as being worked on. The reporter has been told.",
  wait: "Marked as waiting on parts. The reporter has been told.",
  resolve: "Marked fixed. The reporter has been asked to check and confirm.",
  due: "Target date saved.",
  confirm: "Thank you for confirming. The ticket is closed.",
  reopen: "Reopened. It's back with the team.",
  cancel: "Cancelled.",
  photos: "Photos added.",
  watch: "You're following this ticket. You'll hear when it moves.",
  unwatch: "You've stopped following this ticket.",
  commented: "Comment added. The people on this ticket can see it.",
  linked: "Linked. Both tickets show the link.",
  unlinked: "Link removed from both tickets.",
  added: "Schedule added.",
  updated: "Schedule saved.",
  paused: "Schedule paused. It won't open tickets until you resume it.",
  resumed: "Schedule resumed.",
};

/** A success note from `?ok=` or an error from `?error=`. */
export function TicketFlash({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <Note tone="bad">{error}</Note>;
  if (ok && FLASH[ok]) return <Note tone="ok">{FLASH[ok]}</Note>;
  return null;
}

export const todayRaleigh = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** Urgency (unless normal), late, reopened and preventive, as small pills. */
export function TicketTags({ card, reopened }: { card: TicketCard; reopened?: boolean }) {
  const t = card.ticket;
  const u: Urgency = t.urgency;
  const late = lateText(card, new Date(), todayRaleigh());
  const tags = [
    u !== "normal" && (
      <Pill key="u" tone={u === "urgent" ? "bad" : u === "high" ? "warn" : "neutral"}>
        {URGENCY[u].label}
      </Pill>
    ),
    late && (
      <Pill key="late" tone="bad">
        {late}
      </Pill>
    ),
    reopened && t.status === "reopened" && (
      <Pill key="re" tone="warn">
        Reopened
      </Pill>
    ),
    t.kind === "preventive" && (
      <Pill key="p" tone="info">
        Preventive
      </Pill>
    ),
  ].filter(Boolean);
  return tags.length ? <span className={styles.tags}>{tags}</span> : null;
}

const COLUMNS: { title: string; statuses: TicketStatus[] }[] = [
  { title: "New", statuses: ["new", "reopened"] },
  { title: "Assigned", statuses: ["assigned"] },
  { title: "Being worked on", statuses: ["in_progress"] },
  { title: "Waiting on parts", statuses: ["waiting_parts"] },
  { title: "Fixed, waiting for the reporter", statuses: ["resolved"] },
];

const URGENCY_ORDER: Urgency[] = ["urgent", "high", "normal", "low"];

/** The team's open tickets in columns by status, most urgent first. */
export function TicketBoard({ cards, showTeam, names }: { cards: TicketCard[]; showTeam?: boolean; names: NameOf }) {
  return (
    <div className={styles.board}>
      {COLUMNS.map((col) => {
        const items = cards
          .filter((c) => col.statuses.includes(c.ticket.status))
          .sort((a, b) => URGENCY_ORDER.indexOf(a.ticket.urgency) - URGENCY_ORDER.indexOf(b.ticket.urgency) || a.ticket.statusSince.localeCompare(b.ticket.statusSince));
        return (
          <section key={col.title} className={styles.col} aria-label={col.title}>
            <h3 className={styles.colHead}>
              <span>{col.title}</span>
              <span className={styles.count}>{items.length}</span>
            </h3>
            {items.length === 0 && <p className={styles.none}>None</p>}
            {items.map((c) => (
              <Link key={c.id} href={`/it-maintenance/${c.id}`} className={styles.card}>
                <strong>{c.title}</strong>
                <span className={styles.sub}>
                  {c.id}
                  {showTeam ? ` · ${TEAM_LABEL[c.ticket.team]}` : ""} · {c.ticket.room}
                </span>
                <span className={styles.sub}>{c.ticket.assigneeEmail ? names(c.ticket.assigneeEmail) : "Nobody yet"}</span>
                <TicketTags card={c} reopened />
              </Link>
            ))}
          </section>
        );
      })}
    </div>
  );
}
