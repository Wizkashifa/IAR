"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClass } from "./Button";
import styles from "./RequestPage.module.css";

/**
 * The request page's bottom bar (RequestPage `bar`): what's needed, an "Other
 * options" button, and the main button. When the main action has its own panel
 * of fields (`#request-decide`), the main button is a link to it: the click
 * scrolls there and puts focus on the first field, and the bar steps aside
 * while that panel is on screen, since the panel has the real button.
 * Without JavaScript the bar just stays and the link still jumps.
 */
export function RequestBar({ label, more, children }: { label?: ReactNode; more: boolean; children: ReactNode }) {
  const [away, setAway] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = document.getElementById("request-decide");
    if (!panel || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setAway(Boolean(e?.isIntersecting)), { threshold: 0.25 });
    io.observe(panel);
    return () => io.disconnect();
  }, []);

  const onClick = (e: React.MouseEvent) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href="#request-decide"]');
    const panel = document.getElementById("request-decide");
    if (!link || !panel) return;
    e.preventDefault();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    // The first field, else the first button.
    (panel.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea") ?? panel.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
  };

  return (
    <div ref={bar} className={styles.bar} data-sticky-actions role="region" aria-label="Main action" hidden={away} onClick={onClick}>
      {label && <p className={styles.barLabel}>{label}</p>}
      <div className={styles.barButtons}>
        {more && (
          <a href="#request-actions" className={buttonClass({ variant: "quiet" })}>
            Other options
          </a>
        )}
        <div className={styles.barMain}>{children}</div>
      </div>
    </div>
  );
}
