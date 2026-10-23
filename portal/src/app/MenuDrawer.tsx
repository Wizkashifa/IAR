"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The top bar's menu. On a computer it's the row of links as usual; on a
 * phone it folds into a drawer that slides in from the left, opened with the
 * menu button, so the header stays one line.
 */
export function MenuDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.classList.add("menu-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("menu-open");
    };
  }, [open]);
  return (
    <>
      <button type="button" className="menubtn" aria-label={open ? "Close menu" : "Menu"} aria-expanded={open} aria-controls="portal-menu" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={open ? "M18 6L6 18M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>
      <div
        id="portal-menu"
        className={`menu${open ? " open" : ""}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        {children}
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
    </>
  );
}
