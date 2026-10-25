"use client";
import { Button } from "@/components/Button";

export function PrintButton() {
  return (
    <Button variant="primary" icon="book" onClick={() => window.print()}>
      Print
    </Button>
  );
}
