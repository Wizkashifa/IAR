import Link from "next/link";
import { requireViewer } from "@/lib/viewer";
import { visibleModules } from "@/lib/modules";
import { cardStore, NEEDS_OWNER, STATUS_LABEL, TYPE_LABEL } from "@/lib/cards";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await requireViewer();
  const modules = visibleModules(viewer.roles);
  const cards = await (await cardStore()).listByOwner(viewer.email);
  const needsYou = cards.filter((c) => NEEDS_OWNER.includes(c.status));
  const firstName = viewer.name.split(" ")[0];

  return (
    <>
      <h1>Assalamu alaikum, {firstName}</h1>
      <p className="lead">Everything you can do at IAR, in one place.</p>

      {needsYou.length > 0 && (
        <>
          <h2>Waiting on you</h2>
          <div className="attention">
            <ul>
              {needsYou.map((c) => (
                <li key={c.id}>
                  <strong>{c.title}</strong>{" "}
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
