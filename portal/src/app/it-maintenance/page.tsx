import { Button } from "@/components/Button";
import { ItemList, groupedRows, rowsFor, sectionsOf } from "@/components/ItemList";
import { HelpBox } from "@/components/HelpBox";
import { ModuleHead } from "@/components/ModuleHead";
import { todayLocal } from "@/lib/dates";
import { emailsIn } from "@/lib/card-row";
import { cardStore } from "@/lib/cards";
import { nameResolver } from "@/lib/names";
import { groupForViewer } from "@/lib/needs-you";
import { actorFor } from "@/lib/people";
import { requireViewer } from "@/lib/viewer";
import { ticketActor } from "@/lib/tickets/context";
import { TEAM_LABEL, type TicketTeam } from "@/lib/tickets/types";
import { type TicketCard, canImportJira, isOverdue, isTicketCard, isWatching, teamsOf, withTeam } from "@/lib/tickets/workflow";
import { TicketBoard, FLASH } from "./ui";
import { FlashNote } from "@/components/FlashNote";
import styles from "./tickets.module.css";
import { Chips } from "@/components/Chips";
import { Pill } from "@/components/Pill";
import { Tabs } from "@/components/Tabs";
import { worksTeam } from "@/lib/events/tasks";
import { TASK_FLASH } from "../events/ops-ui";
import { AvTasks } from "./AvTasks";

export const dynamic = "force-dynamic";
export const metadata = { title: "IT & Maintenance" };

type Filter = { id: string; label: string; test: (c: TicketCard, me: string, now: Date, today: string) => boolean };

const FILTERS: Filter[] = [
  { id: "all", label: "All open", test: () => true },
  { id: "unassigned", label: "Nobody has it", test: (c) => withTeam(c.ticket) && !c.ticket.assigneeEmail },
  { id: "mine", label: "Assigned to me", test: (c, me) => c.ticket.assigneeEmail === me },
  { id: "urgent", label: "Urgent and high", test: (c) => c.ticket.urgency === "urgent" || c.ticket.urgency === "high" },
  { id: "waiting", label: "Waiting on parts", test: (c) => c.ticket.status === "waiting_parts" },
  { id: "late", label: "Late", test: (c, _me, now, today) => isOverdue(c, now, today) },
];

type Search = { view?: string; layout?: string; team?: string; f?: string; av?: string; ok?: string; error?: string };

/** Ticket messages, and the ones for A/V's event tasks worked from Team tickets. */
const MESSAGES = { ...FLASH, ...TASK_FLASH };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  const actor = ticketActor(viewer);
  const office = actor.roles.includes("office");
  // The office and executives see both teams' tickets (executives to look, not to work them); everyone else only the teams they're on.
  const teams: TicketTeam[] = office || actor.roles.includes("executive") ? ["facilities", "it"] : teamsOf(actor);
  const worker = teams.length > 0;
  const store = await cardStore();
  const [mine, open, needsActor] = await Promise.all([store.listByOwner(viewer.email), store.listByType("ticket"), actorFor(viewer)]);
  const myTickets = mine.filter(isTicketCard);
  const openTickets = open.filter(isTicketCard);
  const following = openTickets.filter((c) => c.ownerEmail !== viewer.email && isWatching(c, viewer.email) && !teams.includes(c.ticket.team));

  // Older links (from Chat alerts and the Jira import) point at the board with ?f= or ?team=.
  const onTeamTab = worker && (sp.view === "team" || Boolean(sp.f || sp.team || sp.layout));
  const team = teams.includes(sp.team as TicketTeam) ? (sp.team as TicketTeam) : teams.length === 1 ? teams[0] : "all";
  const layout = sp.layout === "list" ? "list" : "board";
  const filter = FILTERS.find((f) => f.id === sp.f) ?? FILTERS[0];
  const now = new Date();
  const today = todayLocal(now);
  const queue = openTickets.filter((c) => (team === "all" ? teams.includes(c.ticket.team) : c.ticket.team === team));
  const shown = queue.filter((c) => filter.test(c, actor.email, now, today));
  const teamNew = queue.filter((c) => c.ticket.status === "new" || c.ticket.status === "reopened").length;
  const qs = (over: Record<string, string>) => `/it-maintenance?${new URLSearchParams({ view: "team", layout, team, f: filter.id, ...over })}`;
  // A/V's event tasks, for the people who work them (and the office), unless only Facility Maintenance is picked.
  const showAv = onTeamTab && worksTeam("av", actor.roles) && team !== "facilities";
  const avAll = sp.av === "all";

  const assignees = openTickets.map((c) => c.ticket.assigneeEmail).filter((e): e is string => Boolean(e));
  const names = await nameResolver([...emailsIn([...myTickets, ...following, ...queue]), ...assignees]);
  const rowOpts = { names, today };

  return (
    <div className="stack">
      <ModuleHead accent="it"
        title="IT & Maintenance"
        lead="Ask once for anything broken or needed in the building, IT or A/V. It goes to the right team, and you can follow it until it's done."
        actions={
          <>
            {teamsOf(actor).length > 0 && <Button href="/it-maintenance/today" icon="sun">My work today</Button>}
            <Button variant="primary" icon="plus" href="/it-maintenance/new">
              AV/IT/Maintenance
            </Button>
          </>
        }
      />
      <HelpBox module="it-maintenance" />
      <FlashNote ok={sp.ok} error={sp.error} messages={MESSAGES} />

      {worker && (
        <Tabs
          label="Show"
          tabs={[
            { label: "Your requests", href: "/it-maintenance", on: !onTeamTab },
            { label: team === "all" ? "Team tickets" : `${TEAM_LABEL[team]} tickets`, href: "/it-maintenance?view=team", on: onTeamTab, extra: teamNew > 0 && <Pill tone="warn" small>{teamNew} new</Pill> },
          ]}
          links={[
            ...(office || teamsOf(actor).length > 0 ? [{ label: "Preventive schedules", href: "/it-maintenance/schedules" }] : []),
            ...(canImportJira(actor) ? [{ label: "Import from Jira", href: "/it-maintenance/import" }] : []),
          ]}
        />
      )}

      {onTeamTab ? (
        <div className="stack">
          {showAv && <AvTasks email={actor.email} roles={actor.roles} all={avAll} back={qs(avAll ? { av: "all" } : {})} allHref={qs({ av: "all" })} />}
          <div className={styles.filterBar}>
            {teams.length > 1 && (
              <Chips label="Team" chips={(["all", ...teams] as const).map((t) => ({ label: t === "all" ? "Both teams" : TEAM_LABEL[t], href: qs({ team: t }), on: t === team }))} />
            )}
            <Chips label="Layout" chips={(["board", "list"] as const).map((v) => ({ label: v === "board" ? "Board" : "List", href: qs({ layout: v }), on: v === layout }))} />
          </div>
          <Chips label="Filter" chips={FILTERS.map((f) => ({ label: f.label, href: qs({ f: f.id }), on: f.id === filter.id, count: queue.filter((c) => f.test(c, actor.email, now, today)).length }))} />
          {layout === "board" ? (
            <TicketBoard cards={shown} showTeam={team === "all"} names={names} />
          ) : (
            <ItemList
              title={filter.label}
              rows={rowsFor([...shown].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), needsActor, rowOpts)}
              right={<span>{shown.length}</span>}
              empty="Nothing here."
            />
          )}
        </div>
      ) : (
        <div className="stack">
          <ItemList
            title="Your requests"
            sections={sectionsOf(groupedRows(groupForViewer(myTickets, needsActor), needsActor, rowOpts))}
            empty="Nothing yet. Use “AV/IT/Maintenance” when something breaks or you need something from IT, A/V or maintenance."
            emptyAction={
              <Button size="small" href="/it-maintenance/new">
                AV/IT/Maintenance
              </Button>
            }
          />
          {following.length > 0 && <ItemList title="Requests you follow" rows={rowsFor(following, needsActor, rowOpts)} right={<span>{following.length}</span>} />}
        </div>
      )}
    </div>
  );
}
