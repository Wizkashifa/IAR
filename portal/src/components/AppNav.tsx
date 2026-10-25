"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountLinks, AccountMenu, type Account } from "./AccountMenu";
import { Icon, type IconName } from "./Icon";
import styles from "./AppNav.module.css";

export type NavLink = { href: string; label: string; icon: IconName; badge?: ReactNode };
export type NavGroup = { label?: string; links: NavLink[] };

/** The logo and "IAR Portal", linking home. */
function Brand({ org }: { org: { name: string; shortName: string } }) {
  return (
    <Link href="/" className={styles.brand}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/iar-logo-white.png" alt="" className={styles.mark} />
      <span>
        {org.shortName} <span className={styles.portal}>Portal</span>
      </span>
      <span className="sr-only">, {org.name}: home</span>
    </Link>
  );
}

/** Whether a menu link is the page being shown: Home only on "/", others on their page and anything under it. */
const isCurrent = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/**
 * The portal's frame: the green top bar, the menu and the page.
 * From 1000px wide the menu is a sidebar beside the page; narrower, it's a
 * drawer from the left with search and your account links in it too.
 */
export function AppFrame({
  org,
  groups,
  search,
  drawerSearch,
  unread,
  account,
  children,
}: {
  org: { name: string; shortName: string };
  groups: NavGroup[];
  search: ReactNode;
  drawerSearch: ReactNode;
  unread: number;
  account: Account;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  // The one menu link for this page: the longest that matches, so /purchases/finance lights up Finance desk, not Purchase Requests too.
  const current = groups.flatMap((g) => g.links.map((l) => l.href)).filter((h) => isCurrent(path, h)).sort((a, b) => b.length - a.length)[0];
  const menuBtn = useRef<HTMLButtonElement>(null);
  const rail = useRef<HTMLElement>(null);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    document.body.classList.add(styles.locked);
    // Once the drawer has started sliding in (it's hidden until then), move the keyboard into it.
    const t = window.setTimeout(() => rail.current?.querySelector<HTMLElement>("a, button")?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuBtn.current?.focus();
        return;
      }
      if (e.key !== "Tab" || !rail.current) return;
      // Keep the keyboard inside the open menu.
      const all = [...rail.current.querySelectorAll<HTMLElement>("a, button, input")].filter((x) => x.offsetParent);
      const first = all[0];
      const last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove(styles.locked);
    };
  }, [open]);
  const bellLabel = unread ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <button
            ref={menuBtn}
            type="button"
            className={styles.menuBtn}
            aria-label={open ? "Close menu" : "Menu"}
            aria-expanded={open}
            aria-controls="portal-menu"
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? "x" : "menu"} size="lg" />
          </button>
          <Brand org={org} />
          <div className={styles.spacer} />
          <div className={styles.desk}>{search}</div>
          <Link href="/notifications" className={styles.iconBtn} aria-label={bellLabel} title={bellLabel} aria-current={path === "/notifications" ? "page" : undefined}>
            <Icon name="bell" />
            {unread > 0 && <span className={styles.bellCount}>{unread > 49 ? "50+" : unread}</span>}
          </Link>
          <div className={`${styles.desk} ${styles.deskAccount}`}>
            <span className={styles.sep} aria-hidden="true" />
            <AccountMenu account={account} />
          </div>
        </div>
      </header>
      <div className={styles.shell}>
        <nav ref={rail} id="portal-menu" className={`${styles.rail}${open ? ` ${styles.open}` : ""}`} aria-label="Portal menu">
          <div className={styles.mob}>{drawerSearch}</div>
          {groups.map((g, i) => (
            <div key={g.label ?? i} className={styles.group}>
              {g.label && <div className={styles.groupLabel}>{g.label}</div>}
              {g.links.map((l) => {
                const on = l.href === current;
                return (
                  <Link key={l.href} href={l.href} className={`${styles.link}${on ? ` ${styles.on}` : ""}`} aria-current={on ? "page" : undefined}>
                    <Icon name={l.icon} />
                    <span className={styles.nm}>{l.label}</span>
                    {l.badge}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className={`${styles.mob} ${styles.foot}`}>
            <div className={styles.groupLabel}>{account.name}</div>
            <AccountLinks account={account} withAway={false} onPick={() => setOpen(false)} />
          </div>
        </nav>
        {open && <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden="true" />}
        <main id="main" className={styles.main} tabIndex={-1}>
          <div className={styles.mainInner}>{children}</div>
        </main>
      </div>
    </>
  );
}

/** The frame for someone not signed in (the sign-in page): the top bar and the page, no menu. */
export function PublicFrame({ org, children }: { org: { name: string; shortName: string }; children: ReactNode }) {
  return (
    <>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <Brand org={org} />
        </div>
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>
        <div className={styles.mainInner}>{children}</div>
      </main>
    </>
  );
}
