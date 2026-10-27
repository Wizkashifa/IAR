import { Button } from "@/components/Button";
import { ItemList, Legend, groupedRows, sectionsOf } from "@/components/ItemList";
import { ItemRow } from "@/components/ItemRow";
import { KeyValue } from "@/components/KeyValue";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { RequestPage } from "@/components/RequestPage";
import { Stages } from "@/components/Stages";
import { cardStore } from "@/lib/cards";
import { emailsIn, ROW_TONE, rowState, whoText } from "@/lib/card-row";
import { fmtDay } from "@/lib/format";
import { directory } from "@/lib/groups";
import { nameResolver } from "@/lib/names";
import { groupForViewer } from "@/lib/needs-you";
import { nextStepText, stepsFor } from "@/lib/next-step";
import { actorFor } from "@/lib/people";
import { statusText } from "@/lib/status-text";
import { teamPeople } from "@/lib/teams";
import { requireViewer } from "@/lib/viewer";
import styles from "./styles.module.css";

/**
 * The list and request-page pieces, with the current sample user's real
 * requests, so what shows here is what the module pages will show.
 */
export async function RequestExamples() {
  const viewer = await requireViewer();
  const [actor, dir, store] = await Promise.all([actorFor(viewer), directory(), cardStore()]);
  const cards = await store.listByOwner(viewer.email);
  const directorsOf = (g: string) => teamPeople(dir, g).directors;
  const names = await nameResolver(emailsIn(cards));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const grouped = groupedRows(groupForViewer(cards, actor, { directorsOf }), actor, { names, today, ctx: { directorsOf } });
  const sample = cards.find((c) => c.event && c.status === "in_review") ?? cards[0];
  const directors = sample?.event ? directorsOf(sample.event.committeeGroup) : [];

  return (
    <>
      <Panel title="Module heading" right="components/ModuleHead.tsx">
        <ModuleHead title="Events & Rooms" lead="Request a program or event and book its room." actions={<Button variant="primary" icon="plus">New event request</Button>} />
      </Panel>

      <Panel title="Steps" right="components/Stages.tsx">
        <div className="stack">
          <Stages steps={[{ label: "Submitted", state: "done" }, { label: "Chair approval", state: "now" }, { label: "Finance review", state: "todo" }, { label: "To pay", state: "todo" }, { label: "Paid", state: "todo" }]} />
          <Stages steps={[{ label: "Submitted", state: "done" }, { label: "Director review", state: "skip" }, { label: "Executive review", state: "done" }, { label: "Approved", state: "done" }, { label: "Event day", state: "skip" }]} flag={{ label: "Withdrawn", tone: "bad" }} />
        </div>
      </Panel>

      <div className="stack">
        <h2>List rows</h2>
        <Legend />
        <Panel title="One of each" flush>
          <ul className={styles.rows}>
            <ItemRow title="Youth Halaqa — winter series" id="EV-1042" href="/dev/styles" sub="Youth · Tue, Nov 17" who="You: make the requested changes" status="Changes requested" state="act" />
            <ItemRow title="Halaqa snacks and supplies" id="PO-12007" href="/dev/styles" sub="Youth · $184.50" who="Chair approval: Sample Vice Chair" status="Chair approval" state="wait" />
            <ItemRow title="Youth Family Night" id="EV-1031" href="/dev/styles" sub="Youth · Sat, Nov 7" status="Approved" state="done" />
            <ItemRow title="Main hall side door doesn't latch" id="TK-1003" href="/dev/styles" sub="Facility Maintenance · Main Prayer Hall" who="Sample Facilities: waiting on parts" status="Late" state="bad" />
            <ItemRow lead={<input type="checkbox" aria-label="Pick PO-12004" />} title="Wudu area pipe repair" id="PO-12004" href="/dev/styles" sub="Facility Maintenance · $1,180.00" status="To pay" state="wait" />
          </ul>
        </Panel>
      </div>

      <ItemList
        title="Your requests (live, this sample user)"
        sections={sectionsOf(grouped)}
        chips={[
          { label: "All", href: "/dev/styles", on: true },
          { label: "Events", href: "/dev/styles?kind=event" },
          { label: "Payments", href: "/dev/styles?kind=purchase" },
        ]}
        legend
        empty="You haven't asked for anything yet."
        emptyAction={<Button size="small" variant="primary" href="/events/new">New event request</Button>}
      />

      <ItemList title="An empty list" rows={[]} empty="Nothing waiting for review." />

      {sample && (
        <div className="stack">
          <h2>Request page (live: {sample.id})</h2>
          <div className={styles.frame}>
            <RequestPage
              crumb={{ href: "/dev/styles", label: "Styles" }}
              id={sample.id}
              title={sample.title}
              pills={
                <Pill tone={ROW_TONE[rowState(sample, actor, { ctx: { directorsOf } })]} dot>
                  {statusText(sample)}
                </Pill>
              }
              lead={[sample.committee, `from ${names(sample.ownerEmail)}`, sample.eventDate && fmtDay(sample.eventDate)]}
              steps={stepsFor(sample, { today, directors })}
              next={nextStepText(sample, viewer, names, { today, directors })}
              actions={
                <>
                  <Button variant="primary">Approve</Button>
                  <Button>Send back</Button>
                  <Button variant="quiet">Withdraw</Button>
                </>
              }
              main={
                <>
                  <Panel title="About the event">
                    <p>The request itself goes here: what it is, the marketing brief, the A/V needs, team tasks.</p>
                  </Panel>
                  <Panel title="Comments">
                    <p className="muted">No comments yet.</p>
                  </Panel>
                </>
              }
              side={
                <Panel title="Details">
                  <KeyValue items={[{ label: "Requested by", value: names(sample.ownerEmail) }, { label: "Committee", value: sample.committee }, { label: "Waiting on", value: whoText(sample, viewer, names) ?? "" }]} />
                </Panel>
              }
            />
          </div>
          <h2>Just sent</h2>
          <div className={styles.frame}>
            <RequestPage crumb={{ href: "/dev/styles", label: "Styles" }} id={sample.id} title={sample.title} sent steps={stepsFor(sample, { today, directors })} next={nextStepText(sample, viewer, names, { today, directors })} main={<Panel title="About the event"><p>…</p></Panel>} />
          </div>
        </div>
      )}
    </>
  );
}
