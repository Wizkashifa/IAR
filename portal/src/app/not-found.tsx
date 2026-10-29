import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = { title: "Not available" };

export default function NotFound() {
  return (
    <div className="stack">
      <h1>Not available</h1>
      <EmptyState action={<Button href="/">Back to home</Button>}>
        This page doesn&apos;t exist, or it&apos;s for a team you&apos;re not on. If you followed a link and think you should see it, ask your committee chair.
      </EmptyState>
    </div>
  );
}
