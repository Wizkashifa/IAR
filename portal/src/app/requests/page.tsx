import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { ItemList, groupedRows, sectionsOf } from "@/components/ItemList";
import type { Chip } from "@/components/Chips";
import { HelpBox } from "@/components/HelpBox";
import { ModuleHead } from "@/components/ModuleHead";
import { todayLocal } from "@/lib/dates";
import { emailsIn } from "@/lib/card-row";
import { cardStore } from "@/lib/cards";
import { visibleModules } from "@/lib/modules";
import { groupForViewer } from "@/lib/needs-you";
import { nameResolver } from "@/lib/names";
import { actorFor } from "@/lib/people";
import { requireViewer } from "@/lib/viewer";
import { needsContext } from "@/lib/waiting";
import { KINDS } from "@/lib/kinds";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Requests" };

export default async function MyRequests({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const viewer = await requireViewer();
  const [all, actor, ctx] = await Promise.all([(await cardStore()).listByOwner(viewer.email), actorFor(viewer), needsContext()]);
  const live = new Set(visibleModules(viewer.roles).filter((m) => m.status === "live").map((m) => m.id));
  const kinds = KINDS.filter((k) => live.has(k.module));
  const on = kinds.find((k) => k.type === kind);
  const cards = on ? all.filter((c) => c.type === on.type) : all;
  const names = await nameResolver(emailsIn(cards));
  const sections = sectionsOf(groupedRows(groupForViewer(cards, actor, ctx), actor, { names, today: todayLocal(), ctx }));
  const chips: Chip[] = [
    { label: "All", href: "/requests", on: !on },
    ...kinds.filter((k) => all.some((c) => c.type === k.type)).map((k) => ({ label: k.many, href: `/requests?kind=${k.type}`, on: on?.type === k.type })),
  ];

  return (
    <div className="stack">
      <ModuleHead
        title="My Requests"
        lead="Everything you've asked for, and who it's waiting on."
        actions={kinds.map((k) => (
          <Button key={k.type} href={`${k.path}/new`}>
            {k.newLabel}
          </Button>
        ))}
      />
      <HelpBox module="requests" />
      <ItemList
        title="Your requests"
        sections={sections}
        chips={chips.length > 2 ? chips : undefined}
        legend
        empty={on ? `You haven't sent any ${on.one.toLowerCase()} requests yet.` : "You haven't asked for anything yet. Start with one of the buttons above."}
      />
    </div>
  );
}
