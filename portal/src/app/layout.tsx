import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getViewer } from "@/lib/viewer";
import { ORG } from "@/lib/org";
import { unreadCount } from "@/lib/notifications";
import { isActive, todayLocal } from "@/lib/away";
import { peopleStore } from "@/lib/people";
import { Suspense } from "react";
import { FeedbackLink } from "./FeedbackLink";
import { MenuDrawer } from "./MenuDrawer";
import { navModules } from "@/lib/modules";

export const metadata: Metadata = {
  title: `${ORG.shortName} Portal`,
  description: `Internal tools for the ${ORG.name}`,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const [unread, away] = viewer
    ? await Promise.all([unreadCount(viewer), (await peopleStore()).getAway(viewer.email).catch(() => null)])
    : [0, null];
  const awayNow = Boolean(away && isActive(away, todayLocal()));
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@1,500&family=Outfit:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/iar-logo-white.png" alt={ORG.name} className="brand-logo" />
              {ORG.shortName} <span>Portal</span>
            </Link>
            {viewer && (
              <Link href="/notifications" className="bell bell-mobile" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                {unread > 0 && <span className="count">{unread > 49 ? "50+" : unread}</span>}
              </Link>
            )}
            {viewer && (
              <MenuDrawer>
                <nav className="nav">
                  <Link href="/">Home</Link>
                  <Link href="/requests">My Requests</Link>
                  {navModules(viewer.roles).map((m) => (
                    <Link key={m.id} href={m.href}>
                      {m.nav}
                    </Link>
                  ))}
                </nav>
                <form action="/search" className="topsearch" role="search">
                  <input type="search" name="q" placeholder="Search requests" aria-label="Search requests" />
                </form>
                <div className="user">
                  {viewer.dev && (
                    <Link href="/dev" className="devbadge" title="Local development: switch sample user">
                      Dev mode
                    </Link>
                  )}
                  <Link href="/notifications" className="bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
                    Notifications{unread > 0 && <span className="count">{unread > 49 ? "50+" : unread}</span>}
                  </Link>
                  <Suspense fallback={null}>
                    <FeedbackLink />
                  </Suspense>
                  <Link href="/away" className="me" title="Out of office">
                    {viewer.name}
                    {awayNow && <span className="awaybadge">Away</span>}
                  </Link>
                  {!viewer.dev && <a href="/api/auth/signout">Sign out</a>}
                </div>
              </MenuDrawer>
            )}
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
