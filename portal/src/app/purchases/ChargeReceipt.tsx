"use client";
import { useId, useState } from "react";
import { Button, buttonClass } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { RECEIPT_TYPES } from "./AddReceipts";
import { uploadCardReceipt } from "./receipt-actions";
import styles from "./purchases.module.css";

/** A receipt on a charge: uploaded this time (`id` is its upload), or already on the request being edited. */
export type ChargeFile = { id: string; name: string; existing?: boolean };

/** The receipts on some charges (one, or a lumped group's), each once. */
export const filesOn = (receipts: Record<string, ChargeFile[]>, refs: string[]): ChargeFile[] => [...new Map(refs.flatMap((r) => receipts[r] ?? []).map((f) => [f.id, f])).values()];

type Props = {
  last4: string;
  month: string;
  files: ChargeFile[];
  /** What the receipt is for, for screen readers ("Costco, Oct 3"). */
  label: string;
  onAdd: (f: ChargeFile) => void;
  onRemove: (id: string) => void;
  /** Tells the form an upload started (+1) or finished (-1), so it can't be sent half-way. */
  onBusy: (delta: number) => void;
};

/**
 * "Add receipt" on one charge: each file uploads the moment it's chosen, on
 * its own, so a month of photos never goes up in one send. Several can be
 * added; a receipt already on the request (editing) stays.
 */
export function ChargeReceipt({ last4, month, files, label, onAdd, onRemove, onBusy }: Props) {
  const id = useId();
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");

  const upload = async (list: FileList | null) => {
    const chosen = Array.from(list ?? []);
    if (chosen.length === 0) return;
    setError("");
    for (const file of chosen) {
      setBusy((n) => n + 1);
      onBusy(1);
      try {
        const form = new FormData();
        form.set("last4", last4);
        form.set("month", month);
        form.set("file", file);
        const r = await uploadCardReceipt(form);
        if (r.ok) onAdd({ id: r.id, name: r.name });
        else setError(`${file.name}: ${r.error}`);
      } catch {
        setError(`${file.name} didn't upload. Check your connection and try again.`);
      } finally {
        setBusy((n) => n - 1);
        onBusy(-1);
      }
    }
  };

  return (
    <div className={styles.receipt}>
      {files.length > 0 && (
        <ul className={styles.receiptFiles}>
          {files.map((f) => (
            <li key={f.id}>
              <Icon name="check" size="sm" />
              <span className={styles.receiptName}>{f.name}</span>
              {!f.existing && (
                <Button variant="quiet" size="small" onClick={() => onRemove(f.id)} aria-label={`Remove ${f.name} from ${label}`}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={id} className={buttonClass({ size: "small", className: styles.receiptAdd })}>
        <Icon name="plus" />
        {busy > 0 ? "Uploading…" : files.length ? "Add another receipt" : "Add receipt"}
        <span className="sr-only"> for {label}</span>
      </label>
      <input
        id={id}
        type="file"
        multiple
        accept={RECEIPT_TYPES.join(",")}
        className="sr-only"
        disabled={busy > 0}
        onChange={(e) => {
          void upload(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      {error && (
        <p role="alert" className={styles.receiptError}>
          {error}
        </p>
      )}
    </div>
  );
}
