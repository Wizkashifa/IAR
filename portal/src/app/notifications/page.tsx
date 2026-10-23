import { listNotifications } from "@/lib/notifications";
import { chatEnabled } from "@/lib/chat";
import { mailEnabled } from "@/lib/mail";
import { requireViewer } from "@/lib/viewer";
import { fmtDateTime } from "../purchases/ui";
import { markAllRead, openNotification } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const viewer = await requireViewer();
  const items = await listNotifications(viewer, 100);
  const unread = items.filter((n) => n.unread).length;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Notifications</h1>
          <p className="lead">
            Requests that reached you or changed.{" "}
            {chatEnabled()
              ? "When something is waiting on you, you also get a Google Chat message from IAR Portal."
              : mailEnabled()
                ? "When something is waiting on you, you also get an email."
                : "Alerts aren't switched on yet, so check here and on your home page."}
          </p>
        </div>
        {unread > 0 && (
          <form action={markAllRead}>
            <button className="button secondary" type="submit">Mark all read</button>
          </form>
        )}
      </div>
      {items.length === 0 ? (
        <div className="panel empty">Nothing yet. You&apos;ll see requests here when they reach you or change.</div>
      ) : (
        <ul className="notifs">
          {items.map((n) => (
            <li key={n.id} className={n.unread ? "unread" : ""}>
              <form action={openNotification}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="href" value={n.href} />
                <button type="submit" className="notif">
                  <span className="t">{n.text}</span>
                  <span className="sub">
                    {fmtDateTime(n.at)}
                    {n.to.startsWith("role:") ? " · sent to your team" : ""}
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
