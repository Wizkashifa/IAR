/**
 * The screen map shared by `npm run shots` and `npm run a11y`: each portal
 * screen and the sample user who sees it (lib/dev.ts DEV_PERSONAS ids).
 * Add a row when you add a screen.
 */
const SCREENS = [
  { name: "Home", path: "/", as: "chair" },
  { name: "My Requests", path: "/requests", as: "chair" },
  { name: "New request", path: "/requests/new", as: "chair" },
  { name: "Events", path: "/events", as: "chair" },
  { name: "New event", path: "/events/new", as: "chair" },
  { name: "Event request", path: "/events/EV-1101", as: "chair" },
  { name: "Event with marketing pieces", path: "/events/EV-1107", as: "chair" },
  { name: "Calendar", path: "/calendar", as: "chair" },
  { name: "Find a room", path: "/calendar/find?date=2026-11-07&start=18:00&end=20:00&people=60&food=1", as: "chair" },
  { name: "Purchases", path: "/purchases", as: "chair" },
  { name: "New purchase", path: "/purchases/new", as: "chair" },
  { name: "Purchase request", path: "/purchases/PO-12007", as: "chair" },
  { name: "Saved vendors", path: "/purchases/vendors", as: "chair" },
  { name: "Payments: to pay", path: "/purchases?view=payment", as: "finance" },
  { name: "Card statement", path: "/purchases/statement", as: "finance" },
  { name: "Card receipts", path: "/purchases/new?card=4120", as: "chair" },
  { name: "Marketing", path: "/marketing", as: "marketing" },
  { name: "Marketing team work", path: "/marketing?view=team", as: "marketing" },
  { name: "New marketing request", path: "/marketing/new", as: "member" },
  { name: "Marketing request", path: "/marketing/MK-1002", as: "chair" },
  { name: "Marketing request in progress", path: "/marketing/MK-1002", as: "marketing" },
  { name: "Marketing draft to approve", path: "/marketing/MK-1005", as: "member" },
  { name: "Marketing request marketed", path: "/marketing/MK-1006", as: "chair" },
  { name: "Marketing team work by event", path: "/marketing?view=team&layout=event", as: "marketing" },
  { name: "Add a marketing piece", path: "/marketing/new?event=EV-1101", as: "chair" },
  { name: "Marketing piece for an event", path: "/marketing/MK-1053", as: "chair" },
  { name: "IT & Maintenance", path: "/it-maintenance", as: "facilities" },
  { name: "IT & Maintenance team tickets", path: "/it-maintenance?view=team", as: "facilities" },
  { name: "Event A/V ticket", path: "/it-maintenance/TK-1055", as: "it" },
  { name: "New AV/IT/Maintenance", path: "/it-maintenance/new", as: "member" },
  { name: "Ticket", path: "/it-maintenance/TK-1003", as: "facilities" },
  { name: "My work today", path: "/it-maintenance/today", as: "facilities" },
  { name: "Preventive schedules", path: "/it-maintenance/schedules", as: "facilities" },
  { name: "IT & Maintenance A/V", path: "/it-maintenance?view=team", as: "it" },
  { name: "My work today A/V", path: "/it-maintenance/today", as: "it" },
  { name: "Run sheet", path: "/run-sheet", as: "office" },
  { name: "What's stuck", path: "/stuck", as: "office" },
  { name: "Who's who", path: "/teams", as: "chair" },
  { name: "Library", path: "/library", as: "chair" },
  { name: "Help", path: "/help", as: "member" },
  { name: "Search", path: "/search?q=youth", as: "chair" },
  { name: "Notifications", path: "/notifications", as: "chair" },
  { name: "Notification settings", path: "/notifications/settings", as: "chair" },
  { name: "Out of office", path: "/away", as: "chair" },
  { name: "Feedback", path: "/feedback", as: "member" },
  { name: "Portal Settings", path: "/admin", as: "admin" },
  { name: "Portal measures", path: "/measures", as: "executive" },
];

const BASE = `http://localhost:${process.env.PORT || 3000}`;
const SIZES = [
  { tag: "desktop", width: 1280, height: 900 },
  { tag: "phone", width: 390, height: 844 },
];

/** A browser context signed in as a sample user (the cookie the /dev page sets). */
async function signedIn(browser, as, size, scheme) {
  // Reduced motion, so pages are captured and measured as they settle, not mid-fade.
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: scheme, reducedMotion: "reduce" });
  await ctx.addCookies([{ name: "dev_persona", value: as, url: BASE }]);
  return ctx;
}

/** --only=events,purchases limits the run to screens whose name or path contains one of the words. */
function selected(argv) {
  const only = argv.find((a) => a.startsWith("--only="));
  if (!only) return SCREENS;
  const words = only.slice(7).toLowerCase().split(",").filter(Boolean);
  return SCREENS.filter((s) => words.some((w) => s.name.toLowerCase().includes(w) || s.path.includes(w)));
}

/** Fail early, in plain words, when no dev server is running. */
async function checkServer() {
  try {
    const r = await fetch(`${BASE}/dev`);
    if (r.status === 404) throw new Error("not dev mode");
  } catch {
    console.error(`No portal dev server at ${BASE}. Start one with \`npm run dev\` (or set PORT to the one you're running).`);
    process.exit(2);
  }
}

module.exports = { SCREENS, BASE, SIZES, signedIn, selected, checkServer };
