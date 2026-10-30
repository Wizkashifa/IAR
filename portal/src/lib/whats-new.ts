/**
 * What's new in the portal, newest first. The home page shows a note when
 * there's an entry newer than the last one a person dismissed (remembered in
 * their browser), and /help/whats-new lists them all. Add an entry at the top
 * when something people will notice ships.
 */

export type WhatsNew = {
  /** YYYY-MM-DD. Entries on the same day show together. */
  date: string;
  title: string;
  text: string;
  /** Where to try it. */
  href?: string;
};

export const WHATS_NEW: WhatsNew[] = [
  {
    date: "2026-10-30",
    title: "Marketing pieces for your event",
    text: "Open your event and click Add a marketing piece for each thing you need: a flyer, social media posts, a video, a banner. Each piece has its own due date and page, and marketing sees the event's details and images. You can add them before the event is approved.",
    href: "/events",
  },
  {
    date: "2026-10-29",
    title: "Payment requests are live",
    text: "Payment requests are real now, for everyone: your chair and the finance office get them, and approved requests are paid. Use them instead of the old Requisition Form to pay a vendor, get reimbursed or send in card receipts.",
    href: "/purchases/new",
  },
  {
    date: "2026-10-29",
    title: "Name someone in a comment",
    text: "Type @ in a comment box and pick a name to bring someone in. They get a notice and a Chat message, and their name stands out in the comment. You can name anyone who can already open the request.",
  },
  {
    date: "2026-10-28",
    title: "Card charges autopopulate",
    text: "The finance office uploads IAR's card statement each month, and your charges are filled in for you. Choose a sub-account for each charge (from any committee), say why it was bought and add its receipt right on the charge. Amazon and other repeat stores can be lumped under one receipt.",
    href: "/purchases/new",
  },
  {
    date: "2026-10-28",
    title: "Add receipts after sending",
    text: "Have more receipts than fit in one go? Open the request and add more, as many times as you need, until it's done.",
    href: "/purchases",
  },
  {
    date: "2026-10-26",
    title: "Updates come to Google Chat",
    text: "When one of your requests moves or someone comments, you now get a Chat message right away. Prefer a morning digest, or only the bell? Change it in Notification settings.",
    href: "/notifications/settings",
  },
  {
    date: "2026-10-26",
    title: "See every room's day",
    text: "Picking several rooms on an event request, like all three vans, shows each one's day side by side. Prayers and school hours on the room calendars show like any other booking.",
    href: "/events/new",
  },
  {
    date: "2026-10-26",
    title: "Calendar and the Daily Run Sheet, for everyone",
    text: "Both are now under IAR in the menu, open to everyone, so anyone can see what's happening where today.",
    href: "/run-sheet",
  },
  {
    date: "2026-10-26",
    title: "Replies to your feedback",
    text: "When the portal admins reply to feedback you sent, you hear about it in the portal and in Google Chat, and can answer back. Help is now in the top bar too.",
    href: "/feedback",
  },
  {
    date: "2026-10-25",
    title: "A new look in IAR's colours",
    text: "The portal now uses IAR's new logo, colours and fonts, with a menu down the side on larger screens and a dark mode. Pick light, dark or match your device in your account menu.",
  },
  {
    date: "2026-10-25",
    title: "What happens next, on every request",
    text: "Each request page shows its steps, who has it now and what happens next, with people's names instead of email addresses.",
    href: "/requests",
  },
  {
    date: "2026-10-25",
    title: "Needs you comes first",
    text: "Lists are grouped into Needs you, Waiting on others and Done, so what's waiting on you is always at the top. The number beside Home counts it.",
    href: "/",
  },
  {
    date: "2026-10-25",
    title: "Photos and receipts from your phone",
    text: "Drag in receipts, invoices and photos, or take a picture straight from the form on a phone.",
    href: "/purchases/new",
  },
  {
    date: "2026-10-25",
    title: "Event drafts and a quicker room calendar",
    text: "The event form keeps what you've typed if you leave, and the room calendar updates as soon as you change the room or the day.",
    href: "/events",
  },
  {
    date: "2026-10-25",
    title: "Help on every page",
    text: "A short How this works box at the top of each page, and step-by-step guides under Help in your account menu.",
    href: "/help",
  },
];

/** The newest entry's date, or "" when there are none. */
export const latestWhatsNew = (): string => WHATS_NEW.reduce((d, e) => (e.date > d ? e.date : d), "");

/** Entries newer than the date a person last saw ("" means never), newest first. */
export const whatsNewSince = (seen: string): WhatsNew[] => WHATS_NEW.filter((e) => e.date > seen);
