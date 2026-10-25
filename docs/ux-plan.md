# Bringing the portal up to the demo

The demo (`demo/index.html`) is the design. The live portal (`portal/`) follows the same rules, so a request takes the same route in both. But its screens give people less help: they show less about what happens next, who has a request and what to do. This plan brings the live portal up to the demo, in the order that helps volunteers most.

## Why the two drifted

The demo builds every screen from a few shared pieces:

| Demo piece | What it does |
|---|---|
| `reqPage` | One layout for every request page: title and status, steps, "What happens next", actions, then a main column and a side column |
| `reqStages`, `nextStep` | The step bar and a sentence saying who acts next, in names |
| `yourRequests`, `listPanel`, `itemRow` | Every list, grouped into Needs you / Waiting on others / Done |
| `modHead` | Every module page's heading and its main button |
| `fn(id)` | A person's name, never an address |
| the sidebar (`renderRail`) | Navigation that stays on screen on desktop |

The live portal moved the rules over (`lib/*/workflow.ts`, with tests) but not these screen pieces. `app/ui.tsx` only shares a status pill, the flash message, history and comments. Each module page lays itself out from scratch, so each one ended up a little different, and things like the step bar never got built. Nothing checks the screens against the demo, so the gap grew one module at a time. One change was deliberate: the menu moved into a drawer on every screen size (commit 2794184).

Most of the fix is to build these pieces once in `portal/` and use them on every page.

## Stage 1: shared pieces (the biggest gain)

### 1.1 Request page layout with steps and "What happens next"

- **Plain functions, with tests** (`lib/next-step.ts`):
  - `stepsFor(card)` returns the step labels and which one the request is on. Use the module's own steps: purchases go Submitted → Chair approval → Finance review → To pay → Paid; events go Submitted → Director review → Executive review → Approved → Event day → Close-out → Closed; marketing and tickets use their own stages.
  - `nextStepText(card, viewer, names)` returns one sentence, e.g. "Community Director approves it for Youth, then finance reviews it. You'll get a notification when it's done." Port the wording from the demo's `nextStep`.
  - Both read from the existing workflow modules (`STAGE_LABEL`, `waitingOnFor`). They never change a request.
- **`<RequestPage>`** in `app/ui.tsx`: breadcrumb, title with status pill next to it, a lead line, the step bar with "What happens next", an action row, then a main column (the request, comments, history) and a side column (details, checks, calendar). Same order as the demo's `reqPage`.
- **Move the four request pages onto it:** `events/[id]`, `purchases/[id]`, `marketing/[id]`, `it-maintenance/[id]`.
  - Comments and history go in the main column, so long threads aren't squeezed into the narrow side.
  - Drop the duplicated "Now" field ("Executive approval / Executive approval · 5 days"). The step bar and the waiting time take its place.
  - Cancel and Withdraw go in the action row as a quiet button, not in red at the top of the side column.

### 1.2 Lists grouped by who has to act

- **A plain function** (`lib/needs-you.ts`): `needsViewer(card, viewer)`, covering every module. It counts your own requests sent back or waiting on close-out, purchase approvals, event director and executive reviews, marketing questions and "Fixed: please confirm" tickets. Test it against the sample users in `lib/dev.ts`.
- **`<YourRequests>`** and **`<ItemRow>`**: Needs you (gold edge), Waiting on others, and Done folded away, newest first in each group. Each row shows the title, ID, committee, date or amount, and who has it. It's the same on desktop and phone, so the tables go away for these lists.
- **Use them on:**
  - **My Requests:** add the type chips (All / Events / Purchases / Marketing / IT & Maintenance), the colour key, and the "New …" buttons.
  - **Events, Purchases, Marketing, IT & Maintenance:** the person's own requests come first. Chair, director, finance and team views come after, or under their own heading: "Needs your review" on Events, "Your committees" on Purchases, the team board on IT & Maintenance.
  - **Home:** "Waiting on you" uses `needsViewer`, so a director sees events to review there too, not only purchases.

### 1.3 Names instead of email addresses

- **`lib/names.ts`:** looks up names from IAR's Workspace directory (Admin SDK `users.get`, scope `admin.directory.user.readonly`) and caches them for 15 minutes, the same as the group directory in `lib/groups.ts`. Names stay in Workspace, so the portal keeps no second copy. If a lookup fails, show the part of the address before the @ ("fatima.ahmed" → "Fatima Ahmed").
- **go-live:** add the scope to the domain-wide delegation list in `ops/go-live/src/config.ts` and to the fake in `google-fake.ts`, with a test.
- **Dev mode:** the sample users already have names (`DEV_PERSONAS`).
- **Use names everywhere a person shows up:** Requester / Reported by, Waiting on, Who has it, history (`HistoryList`), the "Assign to" dropdown, ticket board cards, and the Events "Upcoming" rows. Keep the address as a hover title.

## Stage 2: getting around

### 2.1 Sidebar on desktop

- From about 1000px wide, the menu sits on the left all the time, grouped like the demo: Home (with the Waiting on you count), My Requests, *Request*: the live modules, *Your team*: Queues and Run sheet where you have them, *You*: Out of office.
- The header gets the search box, the bell and an account menu (out of office, feedback, sign out).
- Below 1000px it stays the drawer it is today.

### 2.2 A home page about today

- **Quick buttons:** New event request, New purchase request, Marketing request, and the IT & Maintenance request.
- **"Waiting on you"** with a count, from 1.2.
- **"Today at IAR"** for every member: today's bookings from the room calendars (`lib/calendar.ts`), plus a link to the printable run sheet for those who have it.
- **"Your tools" cards:** drop the "Ready" badges, since every tool in the beta is ready. Keep the cards only below the fold, or remove them now that the sidebar lists the tools.

## Stage 3: forms and action panels

- **Ticket actions** (`it-maintenance/[id]`): show only the next sensible action for the ticket's state. New gets "I'll take it" and Assign. Assigned gets Start work. Being worked on gets Mark fixed and Waiting on parts. Everything else goes under "More". Add ready-made replies to the comment box ("Need more info: can you add a photo or the exact room?", "On it. I'll update you by end of day.", "Fixed. Please confirm it works for you.").
- **Event form:**
  - Default "Sponsoring committee" to a committee the person chairs, or the one they used last, not the first one alphabetically.
  - Replace the 18 room checkboxes with a room picker. It shows the rooms people use most first and still allows more than one room.
- **Room calendar** on Events: update as soon as the room or date changes, with no Show button. Open on today and on a room that has bookings. Check the date: it showed Oct 24 when it was already Oct 25 in UTC, which looks like a time-zone slip in the default date.
- **File uploads:** style the file picker to match the buttons, and show the files picked before they're sent. Applies to purchases, tickets and the import page.
- **Event request page:** when a request has no saved checks, say "No checks were saved with this request". Today it says "Pick a date, times and a room to see the checks." (`events/ui.tsx:9`).
- **Button label:** consider "Report a problem or ask for help" instead of "AV/IT/Maintenance request" (renamed on purpose in 2794184, so confirm with the facilities team first).

## Stage 4: phones

- Any table left after 1.2 (purchase line items, the purchase committee list, the run sheet) turns into stacked cards below 640px, with the status under the title.
- Headings: tighten the size of the italic serif page titles on phones so a title fits in two lines.

## Keeping them together

- **One rule in `CLAUDE.md`:** new or changed pages use the shared pieces (`RequestPage`, `YourRequests`, `ItemRow`, the module heading) and match the demo's layout for that screen. If a screen needs to differ from the demo, change the demo first.
- **A side-by-side check:** a small script that opens the demo and the dev portal at desktop and phone widths and saves screenshots of the same screens, for review before each beta release. It's a developer tool, not a test that has to pass.
- **Beta testers:** add "Was it clear what happens next?" to the feedback form's choices, so the beta group tells us where the pages still fall short.

## Order of work

| # | Change | Size | Depends on |
|---|---|---|---|
| 1 | `stepsFor`, `nextStepText`, `<RequestPage>`, and moving the four request pages | Large | — |
| 2 | `needsViewer`, `<YourRequests>`, `<ItemRow>`, and My Requests, module pages and home | Large | — |
| 3 | Names from Workspace, plus the go-live scope | Medium | — |
| 4 | Desktop sidebar and header search | Small | — |
| 5 | Home: quick buttons, Today at IAR, no "Ready" badges | Small | 2 |
| 6 | Ticket action panel and ready-made replies | Medium | 1 |
| 7 | Event form defaults, room picker, room calendar, file picker, checks message | Medium | — |
| 8 | Phone cards for the remaining tables, heading sizes | Small | 2 |
| 9 | `CLAUDE.md` rule and the side-by-side script | Small | 1, 2 |

1, 2 and 3 can go in parallel and cover most of the gap. Each change keeps `npm test`, `npm run typecheck` and `npm run build` passing. Each new plain function gets tests, and the go-live change keeps `ops/go-live` tests passing.
