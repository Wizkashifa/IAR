import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { Crumb } from "@/components/Crumb";
import { FormActions } from "@/components/Field";
import { ModuleHead } from "@/components/ModuleHead";
import { Note } from "@/components/Note";
import { Panel } from "@/components/Panel";
import { ToastOnLoad } from "@/components/toast";
import { chatEnabled } from "@/lib/chat";
import { FYI_CHOICES } from "@/lib/notify-prefs";
import { peopleStore } from "@/lib/people";
import { requireViewer } from "@/lib/viewer";
import { saveNotificationSettings } from "./actions";
import styles from "./settings.module.css";
import { Choice, Choices } from "@/components/Choices";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const viewer = await requireViewer();
  const { saved } = await searchParams;
  const prefs = await (await peopleStore()).getPrefs(viewer.email);

  return (
    <div className="stack">
      <ToastOnLoad message={saved ? "Notification settings saved." : undefined} />
      <Crumb trail={[{ href: "/notifications", label: "Notifications" }]} here="Settings" />
      <ModuleHead
        title="Notification settings"
        lead="Choose how the portal tells you about your requests. Everything is always on the bell and your home page too."
      />
      {!chatEnabled() && <Note tone="warn">Google Chat messages aren&apos;t switched on for the portal yet. Your choices are saved and take effect once they are.</Note>}

      <form action={saveNotificationSettings} className="stack">
        <Panel title="When something is waiting on you">
          <p className={styles.p}>
            Approvals, questions for you, and requests sent back to you always reach you by a Google Chat message from IAR Portal, or by email if Chat can&apos;t reach you. You can&apos;t turn these off: someone is waiting.
          </p>
          <Choice type="checkbox" name="quiet" defaultChecked={prefs.quiet} label={<strong>Quiet overnight</strong>} hint="Messages that would arrive between 9 PM and 7 AM wait until 7 AM. Team spaces aren't affected." />
        </Panel>

        <Panel title="Updates on your requests">
          <Choices legend="When one of your requests moves along, or someone comments, and nothing is waiting on you:" stacked>
            {FYI_CHOICES.map((c) => (
              <Choice key={c.value} type="radio" name="fyi" value={c.value} defaultChecked={prefs.fyi === c.value} label={<strong>{c.label}</strong>} hint={c.hint} />
            ))}
          </Choices>
        </Panel>

        <FormActions>
          <Button type="submit" variant="primary" icon="check">
            Save settings
          </Button>
        </FormActions>
      </form>
    </div>
  );
}
