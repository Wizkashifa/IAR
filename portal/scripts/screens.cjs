/**
 * The screen map shared by `npm run shots` and `npm run a11y`: each portal
 * screen, the sample user who sees it (lib/dev.ts DEV_PERSONAS ids), and the
 * matching demo screen (demo/index.html: go(view, arg) as a demo person).
 * Add a row when you add a screen. demo is null where the demo has no match.
 */
const SCREENS = [
  { name: "Home", path: "/", as: "chair", demo: { view: "home", as: "youthChair" } },
  { name: "My Requests", path: "/requests", as: "chair", demo: { view: "requests", as: "youthChair" } },
  { name: "Events", path: "/events", as: "chair", demo: { view: "events", as: "youthChair" } },
  { name: "New event", path: "/events/new", as: "chair", demo: { view: "newEvent", as: "youthChair" } },
  { name: "Event request", path: "/events/EV-1101", as: "chair", demo: { view: "card", arg: "EV-1031", as: "youthChair" } },
  { name: "Calendar", path: "/calendar", as: "chair", demo: null },
  { name: "Find a room", path: "/calendar/find?date=2026-11-07&start=18:00&end=20:00&people=60&food=1", as: "chair", demo: null },
  { name: "Purchases", path: "/purchases", as: "chair", demo: { view: "purchases", as: "youthChair" } },
  { name: "New purchase", path: "/purchases/new", as: "chair", demo: { view: "newPO", as: "youthChair" } },
  { name: "Purchase request", path: "/purchases/PO-12007", as: "chair", demo: { view: "card", arg: "PO-11045", as: "youthChair" } },
  { name: "Saved vendors", path: "/purchases/vendors", as: "chair", demo: { view: "vendors", as: "youthChair" } },
  { name: "Finance desk", path: "/purchases/finance", as: "finance", demo: { view: "purchases", as: "bookkeeper" } },
  { name: "Marketing", path: "/marketing", as: "marketing", demo: { view: "marketing", as: "mktTeam" } },
  { name: "New marketing request", path: "/marketing/new", as: "member", demo: { view: "newMarketing", as: "youthChair" } },
  { name: "Marketing request", path: "/marketing/MK-1002", as: "chair", demo: { view: "card", arg: "MK-323", as: "youthChair" } },
  { name: "IT & Maintenance", path: "/it-maintenance", as: "facilities", demo: { view: "tickets", as: "maintStaff" } },
  { name: "New AV/IT/Maintenance", path: "/it-maintenance/new", as: "member", demo: null },
  { name: "Ticket", path: "/it-maintenance/TK-1003", as: "facilities", demo: { view: "card", arg: "TK-505", as: "maintStaff" } },
  { name: "My work today", path: "/it-maintenance/today", as: "facilities", demo: null },
  { name: "Preventive schedules", path: "/it-maintenance/schedules", as: "facilities", demo: null },
  { name: "Team Queues", path: "/queues", as: "office", demo: { view: "queues", as: "officeAdmin" } },
  { name: "Run sheet", path: "/run-sheet", as: "office", demo: { view: "runsheet", as: "officeAdmin" } },
  { name: "What's stuck", path: "/stuck", as: "office", demo: null },
  { name: "Who's who", path: "/teams", as: "chair", demo: null },
  { name: "Library", path: "/library", as: "chair", demo: { view: "library", as: "youthChair" } },
  { name: "Help", path: "/help", as: "member", demo: null },
  { name: "Search", path: "/search?q=youth", as: "chair", demo: { view: "search", as: "youthChair" } },
  { name: "Notifications", path: "/notifications", as: "chair", demo: { view: "notifs", as: "youthChair" } },
  { name: "Notification settings", path: "/notifications/settings", as: "chair", demo: null },
  { name: "Out of office", path: "/away", as: "chair", demo: { view: "away", as: "youthChair" } },
  { name: "Feedback", path: "/feedback", as: "member", demo: { view: "feedback", as: "youthChair" } },
  { name: "Portal Settings", path: "/admin", as: "admin", demo: { view: "settings", as: "admin" } },
  { name: "Beta measures", path: "/admin/measures", as: "admin", demo: null },
];

const BASE = `http://localhost:${process.env.PORT || 3000}`;
const SIZES = [
  { tag: "desktop", width: 1280, height: 900 },
  { tag: "phone", width: 390, height: 844 },
];

/** A browser context signed in as a sample user (the cookie the /dev page sets). */
async function signedIn(browser, as, size, scheme) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: scheme });
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
