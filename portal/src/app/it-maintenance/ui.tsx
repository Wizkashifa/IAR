import Link from "next/link";
import { STATUS_LABEL, TEAM_LABEL, URGENCY, type TicketStatus, type Urgency } from "@/lib/tickets/types";
import { type TicketCard, isOverdue, statusFor } from "@/lib/tickets/workflow";
import { fmtDate } from "../ui";

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
  added: "Schedule added.",
  updated: "Schedule saved.",
  paused: "Schedule paused. It won't open tickets until you resume it.",
  resumed: "Schedule resumed.",
};

export function TicketStatusPill({ status }: { status: TicketStatus }) {
  return <span className={`pill ${statusFor(status)}`}>{STATUS_LABEL[status]}</span>;
}

export function UrgencyTag({ urgency }: { urgency: Urgency }) {
  const cls = urgency === "urgent" ? "bad" : urgency === "high" ? "warn" : "info";
  if (urgency === "normal") return null;
  return <span className={`tag ${cls}`}>{URGENCY[urgency].label}</span>;
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function Late({ card }: { card: TicketCard }) {
  return isOverdue(card, new Date(), today()) ? <span className="tag bad">Late</span> : null;
}

/** A table of tickets. `showTeam` when the list mixes IT and facilities. */
export function TicketTable({ cards, empty, showTeam, showAssignee = true }: { cards: TicketCard[]; empty: string; showTeam?: boolean; showAssignee?: boolean }) {
  if (cards.length === 0) return <div className="panel empty">{empty}</div>;
  return (
    <div className="tablewrap">
      <table className="table">
        <thead>
          <tr>
            <th>Request</th>
            <th>Status</th>
            {showAssignee && <th>Who has it</th>}
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`/it-maintenance/${c.id}`}>
                  <strong>{c.title}</strong>
                </Link>
                <div className="sub">
                  {c.id}
                  {showTeam ? ` · ${TEAM_LABEL[c.ticket.team]}` : ""} · {c.ticket.room}
                  {c.ticket.equipment ? ` · ${c.ticket.equipment}` : ""}
                  {c.ticket.jiraKey ? ` · Jira ${c.ticket.jiraKey}` : ""}
                </div>
                <div className="tags">
                  <UrgencyTag urgency={c.ticket.urgency} />
                  <Late card={c} />
                  {c.ticket.kind === "preventive" && <span className="tag ok">Preventive</span>}
                </div>
              </td>
              <td>
                <TicketStatusPill status={c.ticket.status} />
              </td>
              {showAssignee && <td className="sub">{c.ticket.assigneeEmail ?? "Nobody yet"}</td>}
              <td className="sub nowrap">{fmtDate(c.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
export function TicketBoard({ cards, showTeam }: { cards: TicketCard[]; showTeam?: boolean }) {
  return (
    <div className="board">
      {COLUMNS.map((col) => {
        const items = cards
          .filter((c) => col.statuses.includes(c.ticket.status))
          .sort((a, b) => URGENCY_ORDER.indexOf(a.ticket.urgency) - URGENCY_ORDER.indexOf(b.ticket.urgency) || a.ticket.statusSince.localeCompare(b.ticket.statusSince));
        return (
          <section key={col.title} className="bcol" aria-label={col.title}>
            <h3>
              <span>{col.title}</span>
              <span className="sub">{items.length}</span>
            </h3>
            {items.length === 0 && <p className="note">None</p>}
            {items.map((c) => (
              <Link key={c.id} href={`/it-maintenance/${c.id}`} className="bcard">
                <strong>{c.title}</strong>
                <div className="sub">
                  {c.id}
                  {showTeam ? ` · ${TEAM_LABEL[c.ticket.team]}` : ""} · {c.ticket.room}
                </div>
                <div className="sub">{c.ticket.assigneeEmail ?? "Nobody yet"}</div>
                <div className="tags">
                  <UrgencyTag urgency={c.ticket.urgency} />
                  <Late card={c} />
                  {c.ticket.status === "reopened" && <span className="tag warn">Reopened</span>}
                  {c.ticket.kind === "preventive" && <span className="tag ok">Preventive</span>}
                </div>
              </Link>
            ))}
          </section>
        );
      })}
    </div>
  );
}
