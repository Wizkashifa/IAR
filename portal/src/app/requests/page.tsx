import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { ItemList, groupedRows, sectionsOf, type Chip } from "@/components/ItemList";
import { HelpBox } from "@/components/HelpBox";
import { ModuleHead } from "@/components/ModuleHead";
import { todayLocal } from "@/lib/away";
import { emailsIn } from "@/lib/card-row";
import { cardStore, type CardType } from "@/lib/cards";
import { visibleModules } from "@/lib/modules";
import { groupForViewer } from "@/lib/needs-you";
import { nameResolver } from "@/lib/names";
import { actorFor } from "@/lib/people";
import { requireViewer } from "@/lib/viewer";
import { needsContext } from "@/lib/waiting";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Requests" };

const KINDS: { kind: CardType; label: string; module: string; href: string; button: string }[] = [
  { kind: "event", label: "Events", module: "events", href: "/events/new", button: "New event request" },
  { kind: "purchase", label: "Purchases", module: "purchase-requests", href: "/purchases/new", button: "New purchase request" },
  { kind: "marketing", label: "Marketing", module: "marketing-requests", href: "/marketing/new", button: "New marketing request" },
  { kind: "ticket", label: "AV/IT/Maintenance", module: "it-maintenance", href: "/it-maintenance/new", button: "AV/IT/Maintenance" },
];

export default async function MyRequests({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const viewer = await requireViewer();
  const [all, actor, ctx] = await Promise.all([(await cardStore()).listByOwner(viewer.email), actorFor(viewer), needsContext()]);
  const live = new Set(visibleModules(viewer.roles).filter((m) => m.status === "live").map((m) => m.id));
  const kinds = KINDS.filter((k) => live.has(k.module));
  const on = kinds.find((k) => k.kind === kind);
  const cards = on ? all.filter((c) => c.type === on.kind) : all;
  const names = await nameResolver(emailsIn(cards));
  const sections = sectionsOf(groupedRows(groupForViewer(cards, actor, ctx), actor, { names, today: todayLocal(), ctx }));
  const chips: Chip[] = [
    { label: "All", href: "/requests", on: !on },
    ...kinds.filter((k) => all.some((c) => c.type === k.kind)).map((k) => ({ label: k.label, href: `/requests?kind=${k.kind}`, on: on?.kind === k.kind })),
  ];

  return (
    <div className="stack">
      <ModuleHead
        title="My Requests"
        lead="Everything you've asked for, and who it's waiting on."
        actions={kinds.map((k) => (
          <Button key={k.href} href={k.href}>
            {k.button}
          </Button>
        ))}
      />
      <HelpBox module="requests" />
      <ItemList
        title="Your requests"
        sections={sections}
        chips={chips.length > 2 ? chips : undefined}
        legend
        empty={on ? `You haven't sent any ${on.label.toLowerCase()} requests yet.` : "You haven't asked for anything yet. Start with one of the buttons above."}
      />
    </div>
  );
}
