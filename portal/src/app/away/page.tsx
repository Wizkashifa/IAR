import { FlashNote } from "@/components/FlashNote";
import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { HelpBox } from "@/components/HelpBox";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import type { PersonOption } from "@/components/PeoplePicker";
import { isActive, isCurrentOrUpcoming, MAX_AWAY_DAYS } from "@/lib/away";
import { directory } from "@/lib/groups";
import { namesFor } from "@/lib/names";
import { peopleStore } from "@/lib/people";
import { membershipsOf } from "@/lib/teams";
import { requireViewer } from "@/lib/viewer";
import { AwayForm } from "./AwayForm";
import { clearAway } from "./actions";
import styles from "./away.module.css";
import { todayLocal } from "@/lib/dates";
import { ItemRow, Rows } from "@/components/ItemRow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Out of office" };

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default async function AwayPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const viewer = await requireViewer();
  const people = await peopleStore();
  const today = todayLocal();
  const [stored, coverFor, dir] = await Promise.all([people.getAway(viewer.email), people.listAwayByDelegate(viewer.email), directory()]);
  const mine = stored && isCurrentOrUpcoming(stored, today) ? stored : null;
  const covering = coverFor.filter((a) => isCurrentOrUpcoming(a, today));

  // Everyone on a committee or team (from Google Groups), by name, with the first team they're on.
  const me = viewer.email.toLowerCase();
  const emails = new Set<string>();
  for (const g of [...dir.teams, ...dir.pillars]) for (const m of g.members) if (m.type === "USER") emails.add(m.email.toLowerCase());
  if (mine) emails.add(mine.delegate.toLowerCase());
  emails.delete(me);
  const names = await namesFor([...emails, ...covering.map((a) => a.email)]);
  const choices: PersonOption[] = [...emails]
    .map((e) => ({ email: e, name: names.get(e) ?? e, note: membershipsOf(dir, e)[0]?.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (e: string) => names.get(e.toLowerCase()) ?? e;

  return (
    <div className="stack">
      <ModuleHead
        title="Out of office"
        lead={`Going away? Hand your approvals to someone so requests don't wait for you. Up to ${MAX_AWAY_DAYS} days at a time; it switches off by itself after your last day.`}
      />
      <HelpBox module="away" />
      <FlashNote ok={ok} messages={{ saved: "Saved. The person covering has been told.", cleared: "Welcome back. Your approvals come to you again." }} />

      {mine && (
        <Note>
          {isActive(mine, today) ? "You're away now" : `You'll be away from ${fmtDay(mine.from)}`} until {fmtDay(mine.until)}. {nameOf(mine.delegate)} is covering.{" "}
          <form action={clearAway} className={styles.back}>
            <Button type="submit" variant="quiet" size="small">
              {isActive(mine, today) ? "I'm back" : "Cancel it"}
            </Button>
          </form>
        </Note>
      )}

      <Panel title={mine ? "Change your time away" : "Set your time away"}>
        <AwayForm current={mine} today={today} people={choices} />
      </Panel>

      {covering.length > 0 && (
        <Panel title="You're covering for" right={<span>{covering.length}</span>} flush>
          <Rows>
            {covering.map((a) => (
              <ItemRow key={a.email} state="plain" title={a.name} sub={`${fmtDay(a.from)} to ${fmtDay(a.until)}${isActive(a, today) ? " · now" : ""}${a.note ? ` · “${a.note}”` : ""}`} />
            ))}
          </Rows>
        </Panel>
      )}
    </div>
  );
}
