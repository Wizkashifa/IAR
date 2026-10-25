# Portal roadmap: one order of work

This brings the three plans into one sequence:
- `design-system.md`: how the portal looks, and the components it's built from.
- `ux-plan.md`: matching the demo's screens.
- `next-improvements.md`: fixes before the beta, new pages, team tools and health.

It says what has to come first, what can be built at the same time by separate agents, and which planned steps would undo earlier ones if done in the wrong order. The goal hasn't changed: the demo's look and ease of use, working for real.

## Decisions (made Oct 25, 2026)

| # | Decision | Answer |
|---|---|---|
| D1 | Use Mantine for the hard widgets | **Yes**, for the short list below, through our own wrappers |
| D2 | Bring back the desktop sidebar (reverses the "drawer on every screen" change in commit 2794184) | **Yes** from about 1000px wide; the drawer stays on phones |
| D3 | The IT & Maintenance button | Keep the wording but drop "request": **"AV/IT/Maintenance"** |
| D4 | Add the read-only Workspace user scope (`admin.directory.user.readonly`) for names | **Yes.** An IAR super admin approves it in go-live |
| D5 | What must land before the beta | **All of it: waves 0–4** |

## The component kit: Mantine, used narrowly; not Magic UI

**Mantine** (version 9 is current, with regular 9.x releases) is a solid React kit. It styles with CSS Modules and CSS variables, ships an `@layer mantine` stylesheet so our CSS always wins, and has strong accessibility. It's worth using where native HTML falls short and where building our own would take weeks:

| Need in the plans | Mantine piece |
|---|---|
| Event form date and time; Out of office dates | `@mantine/dates` (DatePickerInput, TimeInput) |
| Room picker (several rooms, most-used first, searchable); "Assign to"; choosing a covering person | `MultiSelect` / `Combobox` / `Select` |
| Receipts, W-9s, ticket photos: drag and drop, previews, phone camera | `@mantine/dropzone` |
| Confirmations with Undo | `@mantine/notifications` |
| Confirm dialogs (cancel a request, delete) | `Modal` |
| Search box in the header, jumping to any request, room, team or policy | `@mantine/spotlight` |

Everything else stays ours, built from the demo: panels, list rows, pills, the step bar, the request page, the key–value list, notes and the sidebar. They're simple, specific to IAR, and they are what makes the demo look like the demo. Rebuilding them from Mantine's Card, Badge and AppShell would mean fighting Mantine's defaults to get back to the demo's look.

**How to keep Mantine from becoming a burden:**
- **Wrap every Mantine component** in our own (`components/DateField.tsx`, `components/RoomPicker.tsx`, `components/FileDrop.tsx`, `components/confirm.ts`, `components/toast.ts`). Pages never import `@mantine/*` directly. A Mantine major version (they've come roughly once a year: 7, 8, 9) then touches only those wrappers.
- **Theme Mantine from our tokens.** `theme.ts` points Mantine's colours, radius, fonts and spacing at the CSS variables in `tokens.css`, so there's one source of truth. The guard test allows no raw colours in `theme.ts` either.
- **One colour-scheme switch.** Use Mantine's colour-scheme attribute as the only light/dark switch, and write our dark tokens against it. Two switches (ours and Mantine's) would fight. This replaces the separate `data-theme` idea in `design-system.md`.
- **No Mantine layout or style props in pages** (`Stack`, `Group`, `mt="md"`). Pages use our layout classes, so pages don't depend on Mantine.
- **Mantine 9 needs React 19.2 or later.** The portal is on 19.1, so the upgrade comes first in wave 0.
- **Next.js 16: done in wave 0.** Mantine 9 doesn't build on Next.js 15, because the React that ships inside it lacks APIs Mantine uses. The portal moved to Next.js 16.4.3 with React 19.3.1 and needed no code changes.

**Magic UI is not a fit.** It's a set of animated components for marketing landing pages (marquees, particle backgrounds, animated text). It's built on Tailwind CSS and the Motion animation library and copied in through the shadcn tool. That would bring in a second styling system next to ours and add motion that doesn't belong on approval and receipt screens. The portal's polish should come from calm, consistent detail, as in the demo. If something deserves a small flourish, such as a count ticking up on a dashboard later, a few lines of CSS do it.

## Steps that would undo each other, and the fix

| Risk | What would happen | Fix |
|---|---|---|
| Accessibility fixes before the component work (`next-improvements` 1.6) | Labels, tap sizes and the file input get fixed on old markup, then replaced when forms move onto `Field`, `FileDrop` and Mantine inputs | Do only the skip link and heading levels early. Build the rest into the components, and check with the a11y script in wave 4 |
| Drafts saved before the event form is rebuilt (`next-improvements` 1.4) | Draft code is written against the old form state and redone when date, room and committee fields change | Add drafts in the same wave 2 change that rebuilds the form |
| Our own Toast (`design-system`) and Mantine notifications | Two toast systems | Drop our Toast. `components/toast.ts` wraps Mantine notifications |
| Native `<input list>` room picker (`design-system` decision 8) then a Mantine MultiSelect (`ux-plan` stage 3) | The picker is built twice | Build it once, as `RoomPicker` on Mantine |
| Theme switch in our CSS, then Mantine's colour scheme | Two dark modes that disagree | Use Mantine's switch only (above) |
| Loading and error screens (`next-improvements` 1.3) before `Panel` and `EmptyState` exist | Restyled a week later | Build them in wave 1 with the app shell |
| Desktop sidebar (`ux-plan` 2.1) before `Icon` exists | Sidebar redone to add icons | `Icon` lands in wave 0 |
| "Today at IAR" on home (`ux-plan` 2.2) and "Find a room" (`next-improvements` 2.1) each querying the calendar | Two different calendar queries that drift | One tested function in wave 0, `lib/agenda.ts`: bookings between two times, free rooms for given needs. Both pages use it |
| Grouped lists (`ux-plan` 1.2), then finance batch selection (`next-improvements` 3.2) | `ItemRow` rebuilt to add checkboxes | Give `ItemRow` an optional leading slot (checkbox) from the start |
| Page titles (`next-improvements` 1.2) as a separate sweep over every page | Clashes with every wave 2 module change | Each module's wave 2 owner adds titles for its own pages |
| Fixing the "You:" text in the saved waiting-on strings | Text is fixed in storage, then replaced by `nextStepText` | Fix it only in `nextStepText`, built for the person looking. Stop showing the saved string to anyone but the requester |
| Inline styles removed before pages are rebuilt | Removed, then the page is rewritten anyway | Remove them as part of each page's wave 2 rebuild; the guard test turns strict in wave 4 |

## Order of work and parallel agents

Each wave starts when the one before it has merged. Inside a wave, each agent owns its own files. An agent that needs a change to a shared file (`components/`, `styles/`, `app/layout.tsx`, `app/ui.tsx`) asks for it instead of making it, so parallel branches don't collide. Each agent works in its own git worktree, keeps `npm test`, `npm run typecheck` and `npm run build` passing, and ends with screenshots of its screens next to the demo's.

### Wave 0: foundations (5 agents in parallel)

| Agent | Owns | Delivers |
|---|---|---|
| **0A Design foundation** | `styles/`, `app/globals.css`, `app/fonts.ts`, `app/layout.tsx` (provider only), `components/` (base), `app/dev/styles/` | React 19.2 upgrade; `tokens.css` from the demo; `@layer` order; `next/font` (Source Sans 3, Outfit, Fraunces); Mantine core with the layer stylesheet, `theme.ts` from tokens, one colour-scheme switch; `Icon` (the demo's 44); `Button`, `Pill`, `Panel`, `Note`, `KeyValue`, `EmptyState`, `Field`; the wrappers `DateField`, `RoomPicker`, `FileDrop`, `confirm`, `toast`; `/dev/styles`; guard tests in warning mode |
| **0B Request logic** | `lib/next-step.ts`, `lib/needs-you.ts`, tests | `stepsFor`, `nextStepText(card, viewer, names)` (fixes the "You:" bug), `needsViewer(card, viewer)`, tested against every sample user |
| **0C Names** | `lib/names.ts`, `ops/go-live` | Workspace name lookup with a 15-minute cache and a fallback; the go-live scope and tests (D4) |
| **0D Calendar queries** | `lib/agenda.ts`, tests | Bookings between two times across rooms; free rooms for a date, time, size and food. Uses the existing calendar code |
| **0E Health** | `lib/groups.ts`, `lib/calendar.ts` error paths, `ops/go-live` alerts | Admin alert when directory, calendar, Chat or Drive calls fail; log-based alert on server errors |

0C and 0E both touch `ops/go-live`. 0C changes the scope list and 0E the alert stage, which are different files.

### Wave 1: shared screens (2 agents in parallel)

| Agent | Owns | Delivers |
|---|---|---|
| **1A Request and list pieces** | `components/RequestPage`, `Stages`, `ItemRow`, `ItemList` | The demo's request page layout (steps, "What happens next", action row, main and side columns). Grouped lists (Needs you / Waiting on others / Done) with the optional checkbox slot, and phone layout built in. Uses 0B's functions and 0C's names |
| **1B App shell** | `app/layout.tsx`, `MenuDrawer.tsx`, `app/error.tsx`, `app/loading.tsx`, `app/not-found.tsx` | Sidebar from 1000px and drawer below (D2); header search (Spotlight wrapper), bell and account menu (out of office, theme, feedback, sign out); skip link; heading levels; friendly loading and error screens; favicon, app icons, manifest |

### Wave 2: modules (5 agents in parallel, one per area)

Every agent moves its pages onto `RequestPage` and `ItemList`, uses names, adds page titles, removes inline styles, and replaces tables with list rows.

| Agent | Owns | Also delivers |
|---|---|---|
| **2A Events** | `app/events/`, `app/run-sheet/` | Event form on `DateField`, `RoomPicker` and a committee default; drafts; room calendar that updates as you change it, opening on today and a busy room (and the date check); correct "no saved checks" text; linked room policy; close-out on the request page |
| **2B Purchases** | `app/purchases/` | `FileDrop` for receipts and W-9s; your requests above committee lists; line items as cards on phones; labelled attachments |
| **2C Marketing** | `app/marketing/` | Request page and lists; the type picker stays |
| **2D IT & Maintenance** | `app/it-maintenance/` | Requester view first, team board on its own tab; actions by state with "More"; ready-made replies; `FileDrop` with the phone camera; button reads "AV/IT/Maintenance" (D3) |
| **2E Everyone's pages** | `app/page.tsx`, `app/requests/`, `app/search/`, `app/notifications/`, `app/away/`, `app/queues/` | Home: quick buttons, Waiting on you from `needsViewer`, Today at IAR from `lib/agenda.ts`, no "Ready" badges. My Requests: type chips and colour key. Search through Spotlight and the results page. Out of office on `DateField` and a people picker |

### Wave 3: new pages (parallel, before the beta)

| Agent | Delivers | Needs |
|---|---|---|
| **3A Calendar and Find a room** | Week and month view, and "Find a room" filling in the event form | 0D, 2A's form |
| **3B Who's who** | Committee and team pages and "who handles…" | 0C |
| **3C Help** | "How this works" per module, "What's new" | Wave 2 |
| **3D Office: what's stuck** | Open requests by waiting time, with reminders | 0B, 1A |
| **3E Finance batch work** | Select several, mark paid or entered, filters, QuickBooks CSV | 1A's checkbox slot |
| **3F Beta measures** | Requests per module, time per step, forms started but not sent | 2A's drafts |
| **3G Notification choices** | Right away, digest or portal only; quiet overnight | — |
| **3H Library: policies** | The Policies Shared Drive, searchable and linked from the forms that cite it | Drive scope in sign-in and go-live; the office names the drive |
| **3I Request again** | "Request this again" on past events and purchases | Wave 2 |
| **3J Facilities and Jira** | The gaps the facilities team names in Jira, "My work today" on phones | A session with the facilities team first |

### Wave 4: finish and keep it that way (1–2 agents)

- A phone pass on every screen.
- The demo-versus-portal screenshot script, and a review of every screen next to the demo.
- The accessibility check script on every page, with any fixes.
- Guard tests turned strict.
- The "Styling" section in `CLAUDE.md`.
- Dependabot with grouped monthly updates.
- Dark mode reviewed on every screen.

## A last check: effective, pretty, easy to use

Going through the plans once more against those three goals, these were missing and are now part of the waves above or below:

- **Watch real people use it.** In the first beta week, sit with five volunteers. Give them five tasks: request an event, get reimbursed, report a broken light, approve as a chair, find a free room Saturday evening. Note where they hesitate. This tells us more than any review, and it feeds wave 3's priorities. (Add to `docs/beta-launch.md`.)
- **One vocabulary.** Statuses differ between modules ("In review", "Director review", "Being worked on", "Waiting on parts"). Agree one short glossary of statuses and verbs (Send, Approve, Send back, Withdraw) and use it everywhere. It belongs with 0B, since `stepsFor` and `nextStepText` produce most of these words.
- **What happens after Send.** After submitting, land on the request page with a note saying it was sent, the step bar, and "What happens next". Don't leave people on a bare list. This is part of 1A.
- **Phone forms.** Keep the Send button visible at the bottom of long forms on phones, and keep error messages next to the field they belong to. Both go in the `Field` component (0A) and the form rebuilds in wave 2.
- **Speed.** Mantine components run in the browser. Keep pages as server components, and use Mantine only inside the form and picker wrappers, so pages stay light on phones. Check page weight in wave 4.
- **The demo stays the reference for layout and look.** Mantine's date and room pickers will look slightly different from the demo's native ones; that's expected. If a screen needs a different layout, change the demo first, as `design-system.md` says.
