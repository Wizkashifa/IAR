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
    name: "Purchase Requests",
    summary: "Pay a vendor, get reimbursed, or submit IAR credit card receipts.",
    visibleTo: ["member"],
    phase: 1,
    status: "live",
    href: "/purchases",
    plannedFeatures: [
      "Three request types: pay a vendor or person, reimburse me, card receipts",
      "Line items split across sub-accounts, picked from the chart of accounts",
      "Vendor registry with W-9 on file, stored in a restricted Shared Drive",
      "Chair and finance approval queues, morning digest, overdue escalation",
      "Link a purchase to an event card so event costs roll up",
    ],
  },
  {
    id: "events",
    name: "Events & Rooms",
    summary: "Request a program or event; rooms are checked against the IAR calendar automatically.",
    visibleTo: ["member"],
    phase: 1,
    status: "building",
    href: "/m/events",
    plannedFeatures: [
      "One event card replaces the Program Request and Marketing/AV forms",
      "Room holds placed on IAR's Google Calendar, with setup and teardown time",
      "Room policy rules flagged automatically (school hours, prayers, MPH cleaning gap, food rooms, fees)",
      "Marketing, AV, facilities and security tasks added to the card, unlocked on approval",
      "Marketing and A/V questions asked on the event request, so there's no separate marketing form",
      "Mission review for every event: the pillar director first, then any executive",
    ],
  },
  {
    id: "marketing-requests",
    name: "Marketing Requests",
    summary: "Graphics, signs, announcements, highlights, webpages, short links and staff badges.",
    visibleTo: ["member"],
    phase: 2,
    status: "planned",
    href: "/m/marketing-requests",
    plannedFeatures: [
      "For marketing work that isn't an event. Event marketing is part of the event request",
      "Each request type asks the same questions as today's Marketing/AV form",
      "Weekly review by the marketing team: schedule with a done-by date, ask a question, or decline",
      "Requesters follow each request in My Requests and get notified when it's done",
    ],
  },
  {
    id: "team-queues",
    name: "Team Queues",
    summary: "Your team's open tasks across every event and request.",
    visibleTo: ["office", "finance", "marketing", "av", "facilities", "security"],
    phase: 2,
    status: "planned",
    href: "/m/team-queues",
    plannedFeatures: [
      "Board and list views filtered to your team",
      "Due dates, owners and escalation for overdue tasks",
    ],
  },
  {
    id: "run-sheet",
    name: "Daily Run Sheet",
    summary: "One printable page of what's happening where, per day and campus.",
    visibleTo: ["office", "facilities", "security"],
    phase: 2,
    status: "planned",
    href: "/m/run-sheet",
    plannedFeatures: [
      "Time, room, event, contact, setup notes and after-hours flags",
      "Security check-in and check-out recorded back to the event card",
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
    id: "sw-aid",
    name: "Social & Welfare Aid",
    summary: "Private aid cases and payments, visible only to S&W and finance.",
    visibleTo: ["sw", "finance"],
    phase: 3,
    status: "planned",
    href: "/m/sw-aid",
    plannedFeatures: ["Case records kept out of general purchase requests", "Aid payments with restricted visibility"],
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

export function findModule(id: string): PortalModule | undefined {
  return MODULES.find((m) => m.id === id);
}
