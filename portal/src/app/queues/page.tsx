import { redirect } from "next/navigation";
import { retiredQueueHref } from "@/lib/events/queues";
import { requireViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/**
 * Team Queues is retired: A/V works its event tasks from IT & Maintenance →
 * Team tickets, and Marketing from Marketing Requests → Team work. Old links
 * (in Chat alerts and bookmarks) land on the right one.
 */
export default async function QueuesPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const sp = await searchParams;
  const viewer = await requireViewer();
  redirect(retiredQueueHref(sp.team, viewer.actingRoles));
}
