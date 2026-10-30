"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/Button";
import { FileDrop } from "@/components/FileDrop";

/** File types a receipt or invoice can be. */
export const RECEIPT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
];

function Send() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Uploading…" : "Add these receipts"}
    </Button>
  );
}

/**
 * More receipts for a request already sent, in as many small sends as
 * needed: a big card month doesn't have to go up in one go. `fields` are
 * the request's hidden id and version.
 */
export function AddReceipts({ action, fields }: { action: (form: FormData) => Promise<void>; fields: React.ReactNode }) {
  return (
    <form action={action} className="stack">
      {fields}
      <input type="hidden" name="action" value="attach" />
      <FileDrop
        name="attachments"
        label="Add more receipts"
        required
        camera
        maxFiles={10}
        accept={RECEIPT_TYPES}
        hint="Up to 10 at a time. You can add more later."
      />
      <div>
        <Send />
      </div>
    </form>
  );
}
