import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { chatEnabled } from "@/lib/chat";
import { mailEnabled } from "@/lib/mail";
import { listNotifications } from "@/lib/notifications";
import { requireViewer } from "@/lib/viewer";
import { fmtDateTime } from "@/lib/format";
import { markAllRead, openNotification } from "./actions";
import { ItemRow, Rows } from "@/components/ItemRow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const viewer = await requireViewer();
  const items = await listNotifications(viewer, 100);
  const unread = items.filter((n) => n.unread).length;

  return (
    <div className="stack">
      <ModuleHead
        title="Notifications"
        lead={
          <>
            Requests that reached you or changed.{" "}
            {chatEnabled()
              ? "When something is waiting on you, you also get a Google Chat message from IAR Portal."
              : mailEnabled()
                ? "When something is waiting on you, you also get an email."
                : "Alerts aren't switched on yet, so check here and on your home page."}
          </>
        }
        actions={
          <>
            <Button href="/notifications/settings" icon="sliders">
              Notification settings
            </Button>
            {unread > 0 && (
              <form action={markAllRead}>
                <Button type="submit" icon="check">
                  Mark all read
                </Button>
              </form>
            )}
          </>
        }
      />
      <Panel title="Latest" right={unread > 0 ? <Pill tone="warn">{unread} unread</Pill> : items.length > 0 ? <span>All read</span> : undefined} flush>
        {items.length === 0 ? (
          <EmptyState icon="bell">Nothing yet. You&apos;ll see requests here when they reach you or change.</EmptyState>
        ) : (
          <Rows>
            {items.map((n) => (
              <ItemRow
                key={n.id}
                state={n.unread ? "act" : "plain"}
                submit={{ action: openNotification, fields: { id: n.id, href: n.href } }}
                title={
                  <>
                    {n.unread && <span className="sr-only">Unread: </span>}
                    {n.text}
                  </>
                }
                sub={`${fmtDateTime(n.at)}${n.to.startsWith("role:") ? " · sent to your team" : ""}`}
              />
            ))}
          </Rows>
        )}
      </Panel>
    </div>
  );
}
