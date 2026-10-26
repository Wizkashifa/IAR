"use client";
import { useEffect, type RefObject } from "react";
import type { FormName } from "@/lib/measures";

/**
 * Counts a request form as started the first time someone types in it, for
 * the portal measures (app/admin/measures). Sends only the form's name: no
 * content, nothing about the person. Once per page load; never gets in the
 * way if the count can't be sent.
 */
export function useFormStarted(form: FormName, ref: RefObject<Element | null>) {
  useEffect(() => {
    const target = ref.current?.closest("form") ?? document;
    const onInput = () => {
      const body = JSON.stringify({ form });
      try {
        if (!navigator.sendBeacon?.("/api/measures/started", new Blob([body], { type: "application/json" })))
          void fetch("/api/measures/started", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
      } catch {
        // Counting is never worth an error on someone's form.
      }
    };
    target.addEventListener("input", onInput, { once: true });
    return () => target.removeEventListener("input", onInput);
  }, [form, ref]);
}
