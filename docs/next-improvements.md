# Beyond the demo: making the portal IAR's intranet

> The order of work for this and the other plans is in `portal-roadmap.md`.

`ux-plan.md` brings the live portal's screens up to the demo. This plan covers everything else that would make the portal the place staff and volunteers go first: fixes needed before the beta, new things the demo doesn't have yet, and what keeps it healthy once people rely on it.

Everything here keeps the decisions in `CLAUDE.md`. It runs on IAR's Google Cloud. People, names and roles come from Google Groups and the Workspace directory, never the repo. Files stay in Shared Drives. Budget and the Shura dashboard stay planned.

## 1. Fix before the beta

These are small, but beta testers will notice them on day one.

| # | What's wrong | Fix |
|---|---|---|
| 1.1 | **"You:" is shown to the wrong person.** A request's waiting-on text is saved with "You:" meaning the requester (`lib/*/workflow.ts`, `waitingOnFor`). A chair or the finance office sees "You: The receipt for the snacks is missing" on someone else's request, in search and in the committee lists. | Build the text when the page is shown, for the person looking: "Sample Volunteer: attach the missing receipt". This is the `nextStepText(card, viewer)` function in `ux-plan.md` 1.1. |
| 1.2 | **Every browser tab says "IAR Portal".** Tabs, history and bookmarks can't be told apart. | Give each page its own title, e.g. "Youth Game Night · Events · IAR Portal". |
| 1.3 | **No loading or error screens.** The app has no `loading.tsx` or `error.tsx`. Pages that wait on Google (calendar, directory) show nothing while they load. A server error shows Next.js's generic page. | Show a light placeholder while sections load. Add a friendly error page with "Try again" and "Tell us what happened", which opens the feedback form with the page already filled in. |
| 1.4 | **Long forms can be lost.** The event request is a long form, and there's no draft. A dropped connection, an expired sign-in or a wrong tap loses it. A `draft` status exists in `lib/cards.ts`, but nothing creates one. | Keep an unsent form in the browser as you type (a per-person convenience). Offer "Pick up where you left off" when the form is opened again. |
| 1.5 | **No icon.** The site has no favicon, no app icon and no web manifest, so "Add to Home Screen" on a phone gives a blank tile. Most volunteers will use phones. | Add a favicon, app icons from the IAR logo, and a manifest, so the portal installs like an app. |
| 1.6 | **Accessibility gaps.** There's no "Skip to content" link. Headings jump from H1 to H3 (home, event form, marketing). On the event form, 30 checkboxes and links are under 24px, too small to tap reliably. The purchase form's attachments picker has no label. | Fix each one. Then add a check script that runs these tests across every page, run alongside the side-by-side screenshots in `ux-plan.md`. |
| 1.7 | **The policy you agree to isn't linked.** The event form asks you to tick "I've read the room reservation policy", but there's no link to it. | Link it from Portal Settings, pointing at the policy in the Shared Drive (and later the Library). Do the same for any form that cites a policy. |

## 2. New for everyone

These are the things that would make volunteers open the portal even when they have nothing to request.

### 2.1 IAR calendar and "Find a room"
Today you can check one room on one day. Instead:
- A **week and month view** of approved events across all rooms and campuses, with a filter by room or committee.
- **"Find a room":** enter the date, time, number of people and whether there's food. The portal lists the rooms that fit and are free, and "Request this room" opens the event form already filled in.

Both read the room calendars the portal already reads (`lib/calendar.ts`, `lib/rooms-google.ts`). Nothing is copied.

### 2.2 Who's who
A page per committee and team: chair, vice chair, members, the team's Chat space, what they handle, and a "Request something from this team" button. Plus a search for "who handles keys / the sound system / reimbursements". Everything comes from Google Groups and the Workspace directory (names from `ux-plan.md` 1.3), so it's always current and nothing is stored twice. This answers the most common volunteer question, "who do I ask?".

### 2.3 Library: start with policies
The Library is already planned (phase 2). The first useful slice is small: the **Policies** Shared Drive, searchable from the portal search box, and linked from the forms that cite each policy. Shura documents and other drives follow as planned.

### 2.4 Do it again
- **"Request this again"** on a past event or purchase opens a new request filled in from the old one: last year's Family Night, or this month's cleaning supplies.
- **Event templates**, already listed for phase 4, become a shared version of the same thing.

### 2.5 Help inside the portal
- A short **"How this works"** box at the top of each module, written from the demo guide, with a link to the full steps.
- A **"What's new"** note on the home page when something ships during the beta, so testers know what to try.

### 2.6 Notification choices
Alerts already go only to whoever has to act. Add a simple setting for everything else:
- **Right away in Chat**, **a morning digest**, or **only in the portal**.
- **Quiet overnight**, so a late-night submit doesn't buzz an approver's phone at midnight. It goes out in the morning instead.

## 3. For the teams who run IAR

### 3.1 Facilities: what it takes to leave Jira
The goal is to move facilities into the portal. To get there, list with the facilities team what they actually use in Jira, then close those gaps first. The demo already sketches most of it: due-date timers, linked tickets, followers, equipment and repair history, saved filters, and changing several tickets at once (`plannedFeatures` in `lib/modules.ts`). Two more:
- A **"My work today"** phone view for maintenance staff, with photo upload straight from the camera.
- Running both systems **side by side for two weeks** before Jira is retired.

### 3.2 Finance: batch work
Today each payment and each QuickBooks entry is one request at a time.
- **Select several** approved requests, then mark them paid or entered in QuickBooks together.
- **Filter** by fund, month and payment type.
- **Download a CSV** laid out for QuickBooks entry, so the bookkeeper isn't retyping.

### 3.3 Office: what's stuck
A page for the office and executives listing every open request across all modules. It's sorted by how long it has waited, shows who it's waiting on, and has a "Send a reminder" button. This is the useful core of the Shura dashboard's "in progress" counts, and it's safe to ship now because it shows only requests, not money.

## 4. Keeping it healthy

| Area | Today | Add |
|---|---|---|
| **Silent fallbacks** | If the group directory lookup fails, the portal treats everyone as on no team, and every purchase goes to finance review (`lib/groups.ts`). That's safe, but nobody is told. Calendar lookups degrade quietly too. | Alert `portal-role-admin@` when the directory, calendar, Chat or Drive calls start failing. Show a small "Some information may be out of date" note on affected pages. |
| **Errors** | An uptime check on the sign-in page (`ops/go-live/src/stages/safety.ts`). | A log-based alert on server errors (5xx), so a broken page is noticed before a volunteer reports it. |
| **Beta measures** | The feedback button. | A simple admin page counting requests by module, time to approve at each step, and forms started but not sent. It's computed from Firestore, with no outside analytics. |
| **Speed** | Not measured. Dev mode times aren't meaningful. | Measure page times and cold starts on Cloud Run during the beta. Keeping one instance warm costs a little, so decide from real numbers. |

## Suggested order

1. **Before the beta:** section 1 (all small), plus `ux-plan.md` stage 1.
2. **During the beta:** 2.1 Find a room, 2.2 Who's who, 2.5 help, 4 (alerts and measures). Then listen to the feedback.
3. **After the beta:** 2.3 Library (policies), 3.1 facilities and Jira, 3.2 finance batch work, 3.3 what's stuck, 2.4 do it again, 2.6 notification choices.

Each item keeps `npm test`, `npm run typecheck` and `npm run build` passing, with tests for any new plain functions.
