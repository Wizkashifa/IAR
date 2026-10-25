import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { ModuleHead } from "@/components/ModuleHead";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { chatEnabled } from "@/lib/chat";
import { mailEnabled } from "@/lib/mail";
import { listNotifications } from "@/lib/notifications";
import { requireViewer } from "@/lib/viewer";
import { fmtDateTime } from "../ui";
import { markAllRead, openNotification } from "./actions";
import styles from "./notifications.module.css";

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
          unread > 0 && (
            <form action={markAllRead}>
              <Button type="submit" icon="check">
                Mark all read
              </Button>
            </form>
          )
        }
      />
      <Panel title="Latest" right={unread > 0 ? <Pill tone="warn">{unread} unread</Pill> : items.length > 0 ? <span>All read</span> : undefined} flush>
        {items.length === 0 ? (
          <EmptyState icon="bell">Nothing yet. You&apos;ll see requests here when they reach you or change.</EmptyState>
        ) : (
          <ul className={styles.list}>
            {items.map((n) => (
              <li key={n.id} className={n.unread ? styles.unread : undefined}>
                <form action={openNotification}>
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="href" value={n.href} />
                  <button type="submit" className={styles.item}>
                    <span className={styles.dot} aria-hidden="true" />
                    <span className={styles.text}>
                      <span className={styles.t}>
                        {n.unread && <span className="sr-only">Unread: </span>}
                        {n.text}
                      </span>
                      <span className={styles.s}>
                        {fmtDateTime(n.at)}
                        {n.to.startsWith("role:") ? " · sent to your team" : ""}
                      </span>
                    </span>
                    <Icon name="chevR" className={styles.chev} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
