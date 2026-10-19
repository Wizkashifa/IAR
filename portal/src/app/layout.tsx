import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getViewer } from "@/lib/viewer";
import { ORG } from "@/lib/org";

export const metadata: Metadata = {
  title: `${ORG.shortName} Portal`,
  description: `Internal tools for the ${ORG.name}`,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              {ORG.shortName} <span>Portal</span>
            </Link>
            {viewer && (
              <nav className="nav">
                <Link href="/">Home</Link>
                <Link href="/requests">My Requests</Link>
                <Link href="/purchases">Purchases</Link>
              </nav>
            )}
            {viewer && (
              <div className="user">
                {viewer.dev && (
                  <Link href="/dev" className="devbadge" title="Local development: switch sample user">
                    Dev mode
                  </Link>
                )}
                <span>{viewer.name}</span>
                {!viewer.dev && <a href="/api/auth/signout">Sign out</a>}
              </div>
            )}
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
