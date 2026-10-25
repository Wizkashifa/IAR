"use client";
import { useRef } from "react";
import type { FormName } from "@/lib/measures";
import { useFormStarted } from "./useFormStarted";

/** Put inside a request form: counts it as started the first time someone types (useFormStarted). Renders nothing visible. */
export function FormStarted({ form }: { form: FormName }) {
  const ref = useRef<HTMLSpanElement>(null);
  useFormStarted(form, ref);
  return <span ref={ref} hidden />;
}
