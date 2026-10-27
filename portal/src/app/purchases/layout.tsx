import { Note } from "@/components/Note";
import { portalSettings, purchasesDemoOn } from "@/lib/portal-settings";
import { getViewer } from "@/lib/viewer";

/**
 * Every purchase page. While payment requests are a demo (Portal Settings),
 * says so at the top: for testers, that theirs are real.
 */
export default async function PurchasesLayout({ children }: { children: React.ReactNode }) {
  const [viewer, settings] = await Promise.all([getViewer(), portalSettings()]);
  if (!purchasesDemoOn(settings)) return children;
  return (
    <div className="stack loose">
      {viewer?.tester ? (
        <Note>Payment requests are a demo for everyone else. Yours are real: they go to your chair and finance and send alerts as usual.</Note>
      ) : (
        <Note tone="warn">
          <strong>Demo:</strong> payment requests aren&apos;t live yet. Try anything you like. Nothing here is a real request, nobody is alerted, and nothing will be paid.
        </Note>
      )}
      <div>{children}</div>
    </div>
  );
}
