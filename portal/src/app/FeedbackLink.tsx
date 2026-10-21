"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/** "Feedback" in the top bar, remembering which page it was sent from. */
export function FeedbackLink() {
  const path = usePathname();
  const params = useSearchParams();
  if (path === "/feedback") return <span className="topfeedback on">Feedback</span>;
  const qs = params.toString();
  const from = `${path}${qs ? `?${qs}` : ""}`;
  return (
    <Link href={`/feedback?from=${encodeURIComponent(from)}`} className="topfeedback">
      Feedback
    </Link>
  );
}
