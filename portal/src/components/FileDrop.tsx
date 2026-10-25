"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Dropzone, type FileRejection } from "@mantine/dropzone";
import styles from "./FileDrop.module.css";
import { Field } from "./Field";
import { Icon } from "./Icon";
import { Button } from "./Button";

const MB = 1024 * 1024;
const kb = (n: number) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Add files by dragging them in, choosing them, or (with `camera`) taking a
 * photo on a phone. The chosen files are listed with a Remove button and are
 * sent with the form under `name`, like a native file input, so server
 * actions read them with formData.getAll(name).
 */
export function FileDrop({ name, label, hint, error, required, accept, multiple = true, maxSizeMb = 10, maxFiles = 10, camera }: { name: string; label: string; hint?: string; error?: string; required?: boolean; accept?: string[]; multiple?: boolean; maxSizeMb?: number; maxFiles?: number; camera?: boolean }) {
  const id = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);

  // Keep the real file input (what the form sends) in step with the list on screen.
  useEffect(() => {
    if (!input.current) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.current.files = dt.files;
  }, [files]);

  const add = (more: File[]) => {
    setProblem(undefined);
    setFiles((now) => {
      const next = multiple ? [...now, ...more] : more.slice(0, 1);
      if (next.length > maxFiles) setProblem(`Up to ${maxFiles} files.`);
      return next.slice(0, maxFiles);
    });
  };
  const rejected = (r: FileRejection[]) => {
    const tooBig = r.some((x) => x.errors.some((e) => e.code === "file-too-large"));
    setProblem(tooBig ? `Each file can be up to ${maxSizeMb} MB.` : "That kind of file can't be added here.");
  };

  return (
    <Field label={label} hint={hint} error={error ?? problem} required={required} htmlFor={id}>
      <Dropzone onDrop={add} onReject={rejected} accept={accept} multiple={multiple} maxSize={maxSizeMb * MB} className={styles.zone} inputProps={{ id }}>
        <div className={styles.inner}>
          <Icon name="plus" size="lg" />
          <span>
            <strong>Drop files here</strong> or click to choose
          </span>
          <span className={styles.small}>Up to {maxSizeMb} MB each</span>
        </div>
      </Dropzone>
      {camera && (
        <div>
          <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => add(Array.from(e.currentTarget.files ?? []))} />
          <Button size="small" icon="plus" onClick={() => cam.current?.click()}>
            Take a photo
          </Button>
        </div>
      )}
      {files.length > 0 && (
        <ul className={styles.list}>
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className={styles.fname}>{f.name}</span>
              <span className={styles.small}>{kb(f.size)}</span>
              <Button variant="quiet" size="small" onClick={() => setFiles((now) => now.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {/* What the form sends. Kept focusable (not display:none) so the browser can point at it when it's required and empty. */}
      <input ref={input} type="file" name={name} multiple={multiple} required={required && files.length === 0} tabIndex={-1} aria-hidden="true" className={styles.real} onChange={() => undefined} />
    </Field>
  );
}
