import Link from "next/link";
import { todayLocal } from "@/lib/away";
import { cardStore } from "@/lib/cards";
import { requireViewer } from "@/lib/viewer";
import { ticketActor } from "@/lib/tickets/context";
import { TEAM_LABEL, type TicketTeam } from "@/lib/tickets/types";
import { type TicketCard, canImportJira, isOpen, isOverdue, isTicketCard, isWatching, teamsOf, withTeam } from "@/lib/tickets/workflow";
import { Flash } from "../ui";
import { FLASH, TicketBoard, TicketTable } from "./ui";

export const dynamic = "force-dynamic";

type Filter = { id: string; label: string; test: (c: TicketCard, me: string, now: Date, today: string) => boolean };

const FILTERS: Filter[] = [
  { id: "all", label: "All open", test: () => true },
  { id: "unassigned", label: "Nobody has it", test: (c) => withTeam(c.ticket) && !c.ticket.assigneeEmail },
  { id: "mine", label: "Assigned to me", test: (c, me) => c.ticket.assigneeEmail === me },
  { id: "urgent", label: "Urgent and high", test: (c) => c.ticket.urgency === "urgent" || c.ticket.urgency === "high" },
  { id: "waiting", label: "Waiting on parts", test: (c) => c.ticket.status === "waiting_parts" },
  { id: "late", label: "Late", test: (c, _me, now, today) => isOverdue(c, now, today) },
];

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ view?: string; team?: string; f?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const office = actor.roles.includes("office");
  // The office sees both teams' queues; everyone else only the teams they're on.
  const teams: TicketTeam[] = office ? ["facilities", "it"] : teamsOf(actor);
  const worker = teams.length > 0;
  const store = await cardStore();
  const [mine, open] = await Promise.all([store.listByOwner(viewer.email), store.listByType("ticket")]);
  const myTickets = mine.filter(isTicketCard);
  const openTickets = open.filter(isTicketCard);
  const following = openTickets.filter((c) => c.ownerEmail !== viewer.email && isWatching(c, viewer.email) && !teams.includes(c.ticket.team));

  const team = teams.includes(sp.team as TicketTeam) ? (sp.team as TicketTeam) : teams.length === 1 ? teams[0] : "all";
  const view = sp.view === "list" ? "list" : "board";
  const filter = FILTERS.find((f) => f.id === sp.f) ?? FILTERS[0];
  const now = new Date();
  const today = todayLocal(now);
  const queue = openTickets.filter((c) => (team === "all" ? teams.includes(c.ticket.team) : c.ticket.team === team));
  const shown = queue.filter((c) => filter.test(c, actor.email, now, today));
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ view, team, f: filter.id, ...over });
    return `/it-maintenance?${p}`;
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>IT &amp; Maintenance</h1>
          <p className="lead">Report a building or tech problem once. It goes to the right team, and you can follow it until it&apos;s fixed.</p>
        </div>
        <div className="row">
          {canImportJira(actor) && (
            <Link href="/it-maintenance/import" className="button secondary">
              Import from Jira
            </Link>
          )}
          {teamsOf(actor).length > 0 && (
            <Link href="/it-maintenance/schedules" className="button secondary">
              Preventive schedules
            </Link>
          )}
          <Link href="/it-maintenance/new" className="button">
            Report a problem
          </Link>
        </div>
      </div>
      <Flash ok={sp.ok} error={sp.error} messages={FLASH} />

      {worker && (
        <>
          <h2>{team === "all" ? "Open tickets" : `${TEAM_LABEL[team]} tickets`}</h2>
          <div className="filters">
            {teams.length > 1 &&
              (["all", ...teams] as const).map((t) => (
                <Link key={t} href={qs({ team: t })} className={`filter${t === team ? " on" : ""}`} aria-current={t === team}>
                  {t === "all" ? "Both teams" : TEAM_LABEL[t]}
                </Link>
              ))}
            <span className="spacer" />
            {(["board", "list"] as const).map((v) => (
              <Link key={v} href={qs({ view: v })} className={`filter${v === view ? " on" : ""}`} aria-current={v === view}>
                {v === "board" ? "Board" : "List"}
              </Link>
            ))}
          </div>
          <div className="filters">
            {FILTERS.map((f) => (
              <Link key={f.id} href={qs({ f: f.id })} className={`filter${f.id === filter.id ? " on" : ""}`} aria-current={f.id === filter.id}>
                {f.label} <span>{queue.filter((c) => f.test(c, actor.email, now, today)).length}</span>
              </Link>
            ))}
          </div>
          {view === "board" ? (
            <TicketBoard cards={shown} showTeam={team === "all"} />
          ) : (
            <TicketTable cards={[...shown].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))} showTeam={team === "all"} empty="Nothing here." />
          )}
        </>
      )}

      <h2>Your requests</h2>
      <TicketTable
        cards={[...myTickets].sort((a, b) => Number(isOpen(b.ticket)) - Number(isOpen(a.ticket)) || b.updatedAt.localeCompare(a.updatedAt))}
        showTeam
        empty="Nothing yet. Use “Report a problem” when something breaks or you need something from IT or facilities."
      />

      {following.length > 0 && (
        <>
          <h2>Requests you follow</h2>
          <TicketTable cards={following} showTeam empty="" />
        </>
      )}
    </>
  );
}
