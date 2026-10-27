"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { ThemeSwitch } from "./ThemeSwitch";
import styles from "./AccountMenu.module.css";
import { initials } from "@/lib/text";
import { stopActingAs } from "@/app/admin/actions";

/** `supportAdmin`: the admin's name, when an admin is signed in as this person (lib/act-as.ts). */
export type Account = { name: string; email: string; away: boolean; dev: boolean; supportAdmin?: string };


/** "Send feedback", remembering the page it was sent from (the feedback form shows it). */
function useFeedback() {
  const router = useRouter();
  const path = usePathname();
  const on = path === "/feedback";
  const open = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(`/feedback?from=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  };
  return { on, href: `/feedback?from=${encodeURIComponent(path)}`, open };
}

/**
 * Out of office, feedback, theme and sign out. At the bottom of the phone menu (which already has Out of office, and Help at
 * its top); `AccountMenu` shows it from the header on wider screens.
 */
export function AccountLinks({ account, onPick, withAway = true }: { account: Account; onPick?: () => void; withAway?: boolean }) {
  const fb = useFeedback();
  return (
    <div className={styles.links}>
      {withAway && (
        <Link href="/away" className={styles.link} onClick={onPick}>
          <Icon name="clock" />
          <span>Out of office</span>
          {account.away && <span className={styles.away}>Away</span>}
        </Link>
      )}
      <Link href="/notifications/settings" className={styles.link} onClick={onPick}>
        <Icon name="bell" />
        <span>Notification settings</span>
      </Link>
      <a
        href={fb.href}
        className={styles.link}
        aria-current={fb.on ? "page" : undefined}
        onClick={(e) => {
          onPick?.();
          fb.open(e);
        }}
      >
        <Icon name="message" />
        <span>Send feedback</span>
      </a>
      {account.dev && (
        <Link href="/dev" className={styles.link} onClick={onPick}>
          <Icon name="sliders" />
          <span>Dev mode: switch sample user</span>
        </Link>
      )}
      <div className={styles.theme}>
        <span className={styles.label}>Theme</span>
        <ThemeSwitch />
      </div>
      {account.supportAdmin && (
        <form action={stopActingAs} className={styles.form}>
          <button type="submit" className={styles.link}>
            <Icon name="x" />
            <span>Stop signing in as {account.name}</span>
          </button>
        </form>
      )}
      {!account.dev && !account.supportAdmin && (
        <a href="/api/auth/signout" className={styles.link}>
          <Icon name="x" />
          <span>Sign out</span>
        </a>
      )}
    </div>
  );
}

/** Your name in the header; opens your account links. Closes on Escape or a click elsewhere. */
export function AccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);
  return (
    <div className={styles.who} ref={box}>
      <button ref={btn} type="button" className={styles.btn} aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen(!open)}>
        <span className={styles.av} aria-hidden="true">
          {initials(account.name)}
        </span>
        <span className={styles.nm}>
          <small>{account.away ? "Away" : "Signed in as"}</small>
          <span>{account.name}</span>
        </span>
        <Icon name="chevD" size="sm" />
      </button>
      {open && (
        <div id="account-menu" className={styles.menu}>
          <div className={styles.me}>
            <strong>{account.name}</strong>
            <span>{account.email}</span>
          </div>
          <AccountLinks account={account} onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
