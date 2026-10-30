"use client";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./Button";

/**
 * A form's main button. While the form is sending it shows `busy` and can't
 * be pressed again. Put it inside the <form>.
 */
export function SubmitButton({ children, busy = "Sending…", disabled }: { children: ReactNode; busy?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" type="submit" disabled={pending || disabled}>
      {pending ? busy : children}
    </Button>
  );
}
