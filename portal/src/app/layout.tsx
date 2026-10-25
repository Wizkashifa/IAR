import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import "@mantine/core/styles.layer.css";
import "@mantine/dates/styles.layer.css";
import "@mantine/dropzone/styles.layer.css";
import "@mantine/notifications/styles.layer.css";
import "@mantine/spotlight/styles.layer.css";
import "./globals.css";
import { fontVariables } from "./fonts";
import { AppFrame, PublicFrame, type NavGroup, type NavLink } from "@/components/AppNav";
import { AppNavCount } from "@/components/AppNavCount";
import { Providers } from "@/components/Providers";
import { Search, type SearchPlace } from "@/components/Search";
import type { IconName } from "@/components/Icon";
import { getViewer } from "@/lib/viewer";
import { ORG } from "@/lib/org";
import { unreadCount } from "@/lib/notifications";
import { isActive, todayLocal } from "@/lib/away";
import { peopleStore } from "@/lib/people";
import { visibleModules } from "@/lib/modules";

export const metadata: Metadata = {
  title: { template: `%s · ${ORG.shortName} Portal`, default: `${ORG.shortName} Portal` },
  description: `Internal tools for the ${ORG.name}`,
  applicationName: `${ORG.shortName} Portal`,
};

export const viewport: Viewport = { themeColor: "#0b3a24" };

/** Where each live module sits in the menu, its label there and its icon (the demo's). */
const MENU: Record<string, { group: "request" | "team" | "iar" | "admin"; label: string; icon: IconName }> = {
  events: { group: "request", label: "Events & Rooms", icon: "calendar" },
  "purchase-requests": { group: "request", label: "Purchase Requests", icon: "receipt" },
  "marketing-requests": { group: "request", label: "Marketing Requests", icon: "megaphone" },
  "it-maintenance": { group: "request", label: "IT & Maintenance", icon: "wrench" },
  "team-queues": { group: "team", label: "Team Queues", icon: "tasks" },
  "run-sheet": { group: "team", label: "Daily Run Sheet", icon: "book" },
  "whos-who": { group: "iar", label: "Who's who", icon: "building" },
  admin: { group: "admin", label: "Portal Settings", icon: "sliders" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <html lang="en" className={fontVariables} {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <Providers>{viewer ? <SignedIn viewer={viewer}>{children}</SignedIn> : <PublicFrame org={ORG}>{children}</PublicFrame>}</Providers>
      </body>
    </html>
  );
}

async function SignedIn({ viewer, children }: { viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>>; children: React.ReactNode }) {
  const [unread, away] = await Promise.all([unreadCount(viewer), (await peopleStore()).getAway(viewer.email).catch(() => null)]);
  const live = visibleModules(viewer.roles).filter((m) => m.status === "live" && MENU[m.id]);
  const linksIn = (group: "request" | "team" | "iar" | "admin"): NavLink[] =>
    Object.keys(MENU)
      .filter((id) => MENU[id]!.group === group)
      .flatMap((id) => live.filter((m) => m.id === id))
      .map((m) => ({ href: m.href, label: MENU[m.id]!.label, icon: MENU[m.id]!.icon }));
  const all: NavGroup[] = [
    {
      links: [
        {
          href: "/",
          label: "Home",
          icon: "home",
          badge: (
            <Suspense fallback={null}>
              <AppNavCount viewer={viewer} />
            </Suspense>
          ),
        },
        { href: "/requests", label: "My Requests", icon: "inbox" },
      ],
    },
    { label: "Request", links: linksIn("request") },
    { label: "Your team", links: linksIn("team") },
    { label: "IAR", links: linksIn("iar") },
    { label: "Admin", links: linksIn("admin") },
    { label: "You", links: [{ href: "/away", label: "Out of office", icon: "clock" }] },
  ];
  const groups = all.filter((g) => g.links.length > 0);
  const places: SearchPlace[] = [
    ...groups.flatMap((g) => g.links.map((l) => ({ label: l.label, href: l.href, icon: l.icon }))),
    { label: "Notifications", href: "/notifications", icon: "bell" },
  ];
  const account = { name: viewer.name, email: viewer.email, away: Boolean(away && isActive(away, todayLocal())), dev: viewer.dev };
  return (
    <AppFrame
      org={ORG}
      groups={groups}
      search={<Search places={places} />}
      drawerSearch={<Search places={places} variant="drawer" />}
      unread={unread}
      account={account}
    >
      {children}
    </AppFrame>
  );
}
