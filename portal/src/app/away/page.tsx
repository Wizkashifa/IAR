import { isActive, isCurrentOrUpcoming, MAX_AWAY_DAYS, todayLocal } from "@/lib/away";
import { DEV_DOMAIN, DEV_PERSONAS } from "@/lib/dev";
import { ORG } from "@/lib/org";
import { peopleStore } from "@/lib/people";
import { requireViewer } from "@/lib/viewer";
import { AwayForm } from "./AwayForm";
import { clearAway } from "./actions";

export const dynamic = "force-dynamic";

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default async function AwayPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const viewer = await requireViewer();
  const people = await peopleStore();
  const today = todayLocal();
  const [stored, coverFor] = await Promise.all([people.getAway(viewer.email), people.listAwayByDelegate(viewer.email)]);
  const mine = stored && isCurrentOrUpcoming(stored, today) ? stored : null;
  const covering = coverFor.filter((a) => isCurrentOrUpcoming(a, today));
  const suggestions = viewer.dev ? DEV_PERSONAS.map((p) => p.email).filter((e) => e !== viewer.email) : [];

  return (
    <>
      <h1>Out of office</h1>
      <p className="lead">
        Going away? Hand your approvals to someone so requests don&apos;t wait for you. Up to {MAX_AWAY_DAYS} days at a time; it switches off by itself after your last day.
      </p>
      {ok === "saved" && <div className="flash" role="status">Saved. The person covering has been told.</div>}
      {ok === "cleared" && <div className="flash" role="status">Welcome back. Your approvals come to you again.</div>}

      {mine && (
        <div className="callout info">
          {isActive(mine, today) ? "You're away now" : `You'll be away from ${fmtDay(mine.from)}`} until {fmtDay(mine.until)}. {mine.delegate} is covering.{" "}
          <form action={clearAway} className="inlineform">
            <button className="linkbtn" type="submit">{isActive(mine, today) ? "I'm back" : "Cancel it"}</button>
          </form>
        </div>
      )}

      <AwayForm current={mine} today={today} domain={viewer.dev ? DEV_DOMAIN : ORG.domain} suggestions={suggestions} />

      <p className="note" style={{ marginTop: 12 }}>
        This hands off approvals that wait on you by name, such as a committee&apos;s chair approval. Finance and executive steps already go to everyone in that group, so they don&apos;t need covering.
      </p>

      {covering.length > 0 && (
        <>
          <h2>You&apos;re covering for</h2>
          <div className="attention">
            <ul>
              {covering.map((a) => (
                <li key={a.email}>
                  <strong>{a.name}</strong> <span className="sub">{a.email}</span>
                  <div className="what">
                    {fmtDay(a.from)} to {fmtDay(a.until)}{isActive(a, today) ? " · now" : ""}{a.note ? ` · “${a.note}”` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
