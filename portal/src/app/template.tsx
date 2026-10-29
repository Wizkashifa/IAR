import { Button } from "@/components/Button";
import { Note } from "@/components/Note";
import { getViewer } from "@/lib/viewer";
import { STOP_ACT_AS } from "@/lib/links";

/**
 * Wraps every page, and unlike the layout it's drawn again on each move
 * between pages. So the "signed in as" banner can't go missing in a tab that
 * was open before an admin started signing in as someone (lib/act-as.ts).
 */
export default async function Template({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer?.supportAdmin) return children;
  return (
    <div className="stack loose">
      <Note tone="warn">
        <form action={STOP_ACT_AS} method="post" className="row">
          <span>
            You&apos;re signed in as <strong>{viewer.name}</strong> to troubleshoot. Anything you save is marked as done by you ({viewer.supportAdmin.name}) on their behalf.
          </span>
          <Button type="submit" size="small">
            Stop and go back to you
          </Button>
        </form>
      </Note>
      <div>{children}</div>
    </div>
  );
}
