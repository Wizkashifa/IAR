import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { actorFor, peopleStore } from "@/lib/people";
import { isActive, isCurrentOrUpcoming, todayLocal } from "@/lib/away";
import { visibleModules } from "@/lib/modules";
import { cardStore, NEEDS_OWNER, STATUS_LABEL, TYPE_LABEL } from "@/lib/cards";
import { hrefOf } from "@/lib/card-links";
import { STAGE_LABEL } from "@/lib/purchases/types";
import { actionableBy, approvingAsDirector, canViewDetail, coveringApprover, daysWaiting, isPurchaseCard } from "@/lib/purchases/workflow";

export const dynamic = "force-dynamic";

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function Home() {
  const viewer = await requireViewer();
  const modules = visibleModules(viewer.roles);
  const store = await cardStore();
  const people = await peopleStore();
  const [cards, openPurchases, actor, myAway, coverFor] = await Promise.all([
    store.listByOwner(viewer.email),
    store.listOpenPurchases(),
    actorFor(viewer),
    people.getAway(viewer.email),
    people.listAwayByDelegate(viewer.email),
  ]);
  const today = todayLocal();
  const needsYou = cards.filter((c) => NEEDS_OWNER.includes(c.status));
  const covering = coverFor.filter((a) => isCurrentOrUpcoming(a, today));
  const approvals = actionableBy(openPurchases.filter(isPurchaseCard), actor);
  const firstName = viewer.name.split(" ")[0];

  return (
    <>
      <h1>Assalamu alaikum, {firstName}</h1>
      <p className="lead">Everything you can do at IAR, in one place.</p>

      {myAway && isCurrentOrUpcoming(myAway, today) && (
        <div className="callout info">
          {isActive(myAway, today) ? "You're marked away" : `You'll be away from ${fmtDay(myAway.from)}`} until {fmtDay(myAway.until)}. {myAway.delegate} is covering your approvals. <Link href="/away">Change</Link>
        </div>
      )}
      {covering.map((a) => (
        <div key={a.email} className="callout info">
          {isActive(a, today) ? "You're covering" : `From ${fmtDay(a.from)} you'll cover`} approvals for {a.name} until {fmtDay(a.until)}{a.note ? `: “${a.note}”` : "."}
        </div>
      ))}

      {needsYou.length > 0 && (
        <>
          <h2>Waiting on you</h2>
          <div className="attention">
            <ul>
              {needsYou.map((c) => (
                <li key={c.id}>
                  {hrefOf(c) ? (
                    <Link href={hrefOf(c)!}>
                      <strong>{c.title}</strong>
                    </Link>
                  ) : (
                    <strong>{c.title}</strong>
                  )}{" "}
                  <span className={`pill ${c.status}`}>{STATUS_LABEL[c.status]}</span>
                  <div className="what">
                    {TYPE_LABEL[c.type]} {c.id} · {c.waitingOn}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {approvals.length > 0 && (
        <>
          <h2>Approvals and payments waiting on you</h2>
          <div className="attention">
            <ul>
              {approvals.map((c) => {
                const open = canViewDetail(c, { ...actor, seeAll: viewer.roles.includes("admins") });
                const days = daysWaiting(c);
                return (
                  <li key={c.id}>
                    <Link href={`/purchases/${c.id}`}>
                      <strong>{open ? c.title : "Social & Welfare request"}</strong>
                    </Link>
                    <div className="what">
                      {c.id} · {STAGE_LABEL[c.purchase.stage]} · waiting {days === 0 ? "since today" : `${days} day${days === 1 ? "" : "s"}`}
                      {coveringApprover(c, actor) && ` · covering for ${coveringApprover(c, actor)}`}
                      {approvingAsDirector(c, actor) && " · as director"}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      <h2>Your tools</h2>
      <div className="tiles">
        {modules.map((m) => (
          <Link key={m.id} href={m.href} className="tile">
            <h3>{m.name}</h3>
            <p>{m.summary}</p>
            <div className="meta">
              <span className={`pill ${m.status}`}>
                {m.status === "live" ? "Ready" : m.status === "building" ? "In development" : `Phase ${m.phase}`}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
