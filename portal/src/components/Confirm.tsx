"use client";

import { useRef, useState, type ReactNode } from "react";
import { Modal } from "@mantine/core";
import { Button, type ButtonVariant } from "./Button";

/**
 * A submit button that asks first ("Cancel this request? The room is freed.").
 * Put it inside the form it submits, or give the form's id as `form` (a
 * request page's bottom bar). On "Yes", the form is sent as if a submit button
 * with this `name` and `value` was pressed, so server actions see them.
 */
export function ConfirmButton({ children, title, message, confirmLabel = "Yes", cancelLabel = "Keep it", variant = "default", danger, name, value, size, form }: { children: ReactNode; title: string; message?: ReactNode; confirmLabel?: string; cancelLabel?: string; variant?: ButtonVariant; danger?: boolean; name?: string; value?: string; size?: "small"; form?: string }) {
  const [open, setOpen] = useState(false);
  const submit = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <button ref={submit} type="submit" name={name} value={value} form={form} hidden />
      <Modal opened={open} onClose={() => setOpen(false)} title={title} centered radius="lg">
        <div className="stack">
          {message && <div>{message}</div>}
          <div className="row end">
            <Button onClick={() => setOpen(false)}>{cancelLabel}</Button>
            <Button
              variant={danger ? "danger" : "primary"}
              onClick={() => {
                setOpen(false);
                submit.current?.form?.requestSubmit(submit.current);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
