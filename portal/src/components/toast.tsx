"use client";

import { useEffect } from "react";
import { notifications } from "@mantine/notifications";
import { buttonClass } from "./Button";

export type ToastTone = "ok" | "info" | "warn" | "bad";
const COLOR: Record<ToastTone, string> = { ok: "var(--ok)", info: "var(--info)", warn: "var(--warn)", bad: "var(--bad)" };

/**
 * A short message at the bottom of the screen ("Sent. The chair will review
 * it."). With `undo`, it stays longer and offers an Undo button.
 */
export function toast(message: string, opts: { tone?: ToastTone; undo?: () => void } = {}) {
  const id = notifications.show({
    message: opts.undo ? (
      <span>
        {message}{" "}
        <button
          type="button"
          className={buttonClass({ variant: "quiet", size: "small" })}
          onClick={() => {
            opts.undo?.();
            notifications.hide(id);
          }}
        >
          Undo
        </button>
      </span>
    ) : (
      message
    ),
    color: COLOR[opts.tone ?? "ok"],
    autoClose: opts.undo ? 6000 : 3000,
    withBorder: true,
  });
  return id;
}

/** Shows a toast once when the page loads, e.g. from a server action's ?ok= message. Renders nothing. */
export function ToastOnLoad({ message, tone }: { message?: string; tone?: ToastTone }) {
  useEffect(() => {
    if (message) toast(message, { tone });
  }, [message, tone]);
  return null;
}
