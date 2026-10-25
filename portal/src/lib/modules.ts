import type { Role } from "./org";

export type PortalModule = {
  id: string;
  name: string;
  summary: string;
  /** Roles that see this module. Holding any one is enough. */
  visibleTo: Role[];
  phase: 1 | 2 | 3 | 4;
  /** "live" modules link to a working page; others show what is coming. */
  status: "live" | "building" | "planned";
  /** Short name for the top menu, shown once the module is live. */
  nav?: string;
  href: string;
  plannedFeatures: string[];
};

export const MODULES: PortalModule[] = [
  {
    id: "my-requests",
    name: "My Requests",
    summary: "Everything you've submitted, where it stands, and what's waiting on you.",
    visibleTo: ["member"],
    phase: 1,
    status: "live",
    href: "/requests",
    plannedFeatures: [],
  },
  {
    id: "purchase-requests",
    nav: "Purchases",
    name: "Purchase Requests",
    summary: "Pay a vendor, get reimbursed, or submit IAR credit card receipts.",
    visibleTo: ["member"],
    phase: 1,
    status: "live",
    href: "/purchases",
    plannedFeatures: [],
  },
  {
    id: "events",
    nav: "Events",
    name: "Events & Rooms",
    summary: "Request a program or event; rooms are checked against the IAR calendar automatically.",
    visibleTo: ["member"],
    phase: 1,
    status: "live",
    href: "/events",
    plannedFeatures: [],
  },
  {
    id: "calendar",
    nav: "Calendar",
    name: "Calendar",
    summary: "What's booked in every room, by week or month. Find a free room and request it in one step.",
    visibleTo: ["member"],
    phase: 1,
    status: "live",
    href: "/calendar",
    plannedFeatures: [],
  },
  {
    id: "marketing-requests",
    nav: "Marketing",
    name: "Marketing Requests",
    summary: "Graphics, signs, announcements, highlights, webpages, short links and staff badges.",
    visibleTo: ["member"],
    phase: 2,
    status: "live",
    href: "/marketing",
    plannedFeatures: [
      "A board view for the marketing team, alongside event marketing tasks in Team Queues",
      "File uploads straight to the marketing Shared Drive, instead of a Drive link",
    ],
  },
  {
    id: "it-maintenance",
    nav: "IT & Maintenance",
    name: "IT & Maintenance",
    summary: "Report a building or tech problem and follow it until it's fixed.",
    visibleTo: ["member"],
    phase: 2,
    status: "live",
    href: "/it-maintenance",
    plannedFeatures: [
      "Equipment list with each item's repair history (the asset tracker)",
      "Rooms from IAR's Google Calendar instead of a fixed list",
      "Jira-style planning (sprints, backlog, grouped work, reports) if the facilities team uses it after the move",
      "Retire Jira after two weeks side by side",
    ],
  },
  {
    id: "team-queues",
    nav: "Queues",
    name: "Team Queues",
    summary: "Your team's open tasks across every event and request.",
    visibleTo: ["office", "marketing", "av", "security"],
    phase: 2,
    status: "live",
    href: "/queues",
    plannedFeatures: [
      "A board view, alongside the list",
      "Reminders and escalation for overdue tasks",
    ],
  },
  {
    id: "run-sheet",
    nav: "Run sheet",
    name: "Daily Run Sheet",
    summary: "One printable page of what's happening where, per day and campus.",
    visibleTo: ["office", "facilities", "security"],
    phase: 2,
    status: "live",
    href: "/run-sheet",
    plannedFeatures: [
      "Approved facility rentals on the sheet, once rentals move into the portal",
    ],
  },
  {
    id: "rentals",
    name: "Facility Rentals",
    summary: "Review gym and hall rental requests from outside renters.",
    visibleTo: ["office"],
    phase: 3,
    status: "planned",
    href: "/m/rentals",
    plannedFeatures: [
      "Public request page for renters without an IAR account",
      "Fees, deposits, agreements and insurance uploads",
      "Same approval flow as event cards",
    ],
  },
  {
    id: "budget",
    name: "Budget",
    summary: "Where the money comes from and where it stands, by committee or for all of IAR.",
    visibleTo: ["chairs", "finance", "executive", "shura"],
    phase: 3,
    status: "planned",
    href: "/m/budget",
    plannedFeatures: [
      "FY budget by cost center and campus, with a Sankey from funding source to spent, committed and available",
      "Revenue sorted as unrestricted gifts, designated donations and program revenue",
      "QuickBooks import with sorting rules; unassigned gifts wait for finance",
      "Chairs see only their own committees",
    ],
  },
  {
    id: "shura-dashboard",
    name: "Shura / Board Dashboard",
    summary: "Money at a glance, with a way to ask finance or the executive for something.",
    visibleTo: ["shura"],
    phase: 3,
    status: "planned",
    href: "/m/shura-dashboard",
    plannedFeatures: [
      "Received vs. spent, committees against the calendar, restricted money held, last year's close",
      "Requests: a report from finance, a budget amendment or a spending review from the executive",
    ],
  },
  {
    id: "admin",
    name: "Portal Settings",
    summary: "Committees and teams from Google Groups, the fund each team charges, and IAR's cards.",
    visibleTo: ["admins"],
    phase: 1,
    status: "live",
    href: "/admin",
    plannedFeatures: ["Rooms and their calendars", "Policy rules and fees as data"],
  },
];

export function visibleModules(roles: Role[]): PortalModule[] {
  return MODULES.filter((m) => m.visibleTo.some((r) => roles.includes(r)));
}

/** Top-menu links: live modules this person can see. */
export function navModules(roles: Role[]): PortalModule[] {
  return visibleModules(roles).filter((m) => m.status === "live" && m.nav);
}

export function findModule(id: string): PortalModule | undefined {
  return MODULES.find((m) => m.id === id);
}
