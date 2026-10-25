import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/Confirm";
import { EmptyState } from "@/components/EmptyState";
import { ItemRow } from "@/components/ItemRow";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { canOpenCard } from "@/lib/access";
import { KINDS, hrefOf, kindOf } from "@/lib/kinds";
import { ROW_TONE, type RowState } from "@/lib/card-row";
import { cardStore, type Card } from "@/lib/cards";
import { nameResolver } from "@/lib/names";
import { actorFor } from "@/lib/people";
import { AGE_LABEL, ageGroup, canRemind, groupByAge, lastReminder, mayOpenStuck, reminderLabel, stuckItems, whoWaiting, type AgeGroup, type StuckItem } from "@/lib/stuck";
import { requireViewer } from "@/lib/viewer";
import { needsContext } from "@/lib/waiting";
import { fmtDateTime } from "@/lib/format";
import { sendReminder } from "./actions";
import styles from "./stuck.module.css";
import { Chips } from "@/components/Chips";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "What's stuck" };

/** The edge and the days pill: red over a week, gold 3–7 days, blue under 3. */
const AGE_STATE: Record<AgeGroup, RowState> = { week: "bad", days: "act", recent: "wait" };

const daysText = (n: number) => (n === 0 ? "Today" : `${n} day${n === 1 ? "" : "s"}`);
/** Purchases carry the fund ("Youth Expenses"); dropping the ending files them with the committee's other requests ("Youth"). */
const committeeOf = (c: Card) => (c.committee || c.event?.committeeName || "No committee").replace(/(\s+Fund)?\s+Expenses$/, "");

export default async function StuckPage({ searchParams }: { searchParams: Promise<{ kind?: string; committee?: string; sent?: string; error?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  if (!mayOpenStuck(viewer.roles)) notFound();

  const store = await cardStore();
  const [purchases, events, marketing, tickets, actor, ctx] = await Promise.all([
    store.listOpenPurchases(),
    store.listByType("event", ["submitted", "in_review", "changes_requested", "close_out"]),
    store.listByType("marketing"),
    store.listByType("ticket"),
    actorFor(viewer),
    needsContext(),
  ]);
  const now = new Date().toISOString();
  const all = stuckItems([...purchases, ...events, ...marketing, ...tickets], now, ctx);

  const kind = KINDS.find((k) => k.type === sp.kind)?.type;
  const ofKind = kind ? all.filter((i) => i.card.type === kind) : all;
  const committees = [...new Set(ofKind.map((i) => committeeOf(i.card)))].sort((a, b) => a.localeCompare(b));
  const committee = sp.committee && committees.includes(sp.committee) ? sp.committee : undefined;
  const shown = committee ? ofKind.filter((i) => committeeOf(i.card) === committee) : ofKind;
  const groups = groupByAge(shown);

  const href = (o: { kind?: string; committee?: string }) => {
    const q = new URLSearchParams();
    if (o.kind) q.set("kind", o.kind);
    if (o.committee) q.set("committee", o.committee);
    const s = q.toString();
    return s ? `/stuck?${s}` : "/stuck";
  };
  const here = href({ kind, committee });
  const names = await nameResolver(shown.flatMap((i) => i.holder.to.flatMap((r) => ("email" in r ? [r.email] : []))).concat(shown.map((i) => i.card.ownerEmail)));
  const seeAll = viewer.roles.includes("admins");

  const row = (item: StuckItem) => {
    const { card, days, holder } = item;
    const open = canOpenCard(card, { ...actor, seeAll });
    // Someone who can't open it (a Social & Welfare request) sees that it's waiting, not what it is.
    const title = open ? card.title : card.purchase?.restricted ? "Social & Welfare request" : "Private request";
    const link = open ? hrefOf(card) : null;
    const state = AGE_STATE[ageGroup(days)];
    const who = whoWaiting(holder.to, names);
    const last = lastReminder(card);
    return (
      <ItemRow
        key={card.id}
        title={link ? <Link href={link}>{title}</Link> : title}
        id={card.id}
        sub={`${kindOf(card.type)?.one ?? card.type} · ${committeeOf(card)} · ${holder.step}`}
        who={holder.to.length ? `Waiting on ${who}` : "The daily job follows this one up"}
        state={state}
        right={
          <>
            <Pill tone={ROW_TONE[state]} dot>
              {daysText(days)}
            </Pill>
            {canRemind(item, now) ? (
              <form action={sendReminder} className={styles.remind}>
                <input type="hidden" name="id" value={card.id} />
                <input type="hidden" name="back" value={here} />
                <ConfirmButton
                  size="small"
                  title="Send a reminder?"
                  confirmLabel="Send reminder"
                  cancelLabel="Not now"
                  message={
                    <p>
                      {who.charAt(0).toUpperCase() + who.slice(1)} gets a message in Google Chat (or an email) about {open ? reminderLabel(card) : card.id}, signed by you. It goes in the request&apos;s history, and you can send one a day.
                    </p>
                  }
                >
                  Send a reminder
                </ConfirmButton>
              </form>
            ) : (
              last && <span className={styles.sent}>Reminded {fmtDateTime(last)}</span>
            )}
          </>
        }
      />
    );
  };

  return (
    <div className="stack">
      <ModuleHead title="What's stuck" lead="Every open request, longest wait first: how long it has waited at its step, and who it's waiting on. A reminder goes to them in Google Chat." />
      {sp.error && <Note tone="bad">{sp.error}</Note>}
      {sp.sent && !sp.error && <Note tone="ok">Reminder sent for {sp.sent}. It&apos;s in the request&apos;s history.</Note>}

      <div className={styles.filters}>
        <Chips label="Kind of request" chips={[{ label: "All", href: href({ committee }), on: !kind, count: all.length }, ...KINDS.map((k) => ({ label: k.many, href: href({ kind: k.type }), on: kind === k.type, count: all.filter((i) => i.card.type === k.type).length }))]} />
        {committees.length > 1 && (
          <Chips label="Committee" chips={[{ label: "Every committee", href: href({ kind }), on: !committee }, ...committees.map((c) => ({ label: c, href: href({ kind, committee: c }), on: committee === c }))]} />
        )}
      </div>

      <Panel title="Waiting on someone" right={<span>{shown.length} open</span>} flush>
        {shown.length === 0 ? (
          <EmptyState icon="check">{all.length ? "Nothing waiting here. Try another filter." : "Nothing is waiting on anyone right now."}</EmptyState>
        ) : (
          (Object.keys(AGE_LABEL) as AgeGroup[])
            .filter((g) => groups[g].length > 0)
            .map((g) => (
              <section key={g} aria-label={AGE_LABEL[g]}>
                <h3 className={styles.band}>
                  {AGE_LABEL[g]} <span>{groups[g].length}</span>
                </h3>
                <ul className={styles.list}>{groups[g].map(row)}</ul>
              </section>
            ))
        )}
      </Panel>
      <p className="note">The daily job already reminds people after 3 days and goes to the director after 5. A reminder from here is for when a nudge from the office helps.</p>
    </div>
  );
}
