# Beta launch runbook

How to put the portal on IAR's Google Cloud for a small group of testers. One command, **go-live** (`ops/go-live/`, see its [README](../ops/go-live/README.md)), does the setup. It runs on an IAR super admin's computer, shows every change before making it, and is safe to run again. [setup.md](setup.md) describes each step by hand, as a reference and a fallback.

**Ground rules:**
- Everything goes in IAR's Google organization (islam1.org): IAR's Cloud project, IAR's Workspace, IAR's billing account. Never a personal account or project, and never any host except Cloud Run in IAR's project.
- **Never create or download a service account key.** The portal signs its own tokens.
- go-live **asks separately** before anything that costs money, widens access or may email people: linking billing, a license for `portal@`, the delegation scopes, the budget, and adding the testers.
- **This repo is public.** Names, emails and roles live in Google Groups; funds, cards and room settings live in Portal Settings (Firestore). Card entries hold only the last four digits. The members Sheet stays in IAR's Drive, never in the repo.
- Keep the old forms running during the beta (Requisition, Program Request, Marketing/AV) and Jira alongside IT & Maintenance. Nobody loses a way to get paid or get help while we test.

## What's in the beta

| In the beta | Not yet |
| --- | --- |
| Sign-in with @islam1.org, limited to the beta group; alerts in Google Chat, with each person's notification choices and quiet overnight | Facility rentals and the public rental page |
| Home ("Waiting on you", Today at IAR, What's new), My Requests, Search, Help, Feedback, Out of office | Budget and Shura dashboard: still being designed |
| Purchase Requests (pay, reimburse, card receipts), with reminders, a morning digest and the Finance desk | Library beyond policies (Shura documents, each committee's drive) |
| Events & Rooms on IAR's room calendars, with asks for a booked time; the Calendar and Find a room | Asset tracker |
| Marketing Requests with file uploads, Team Queues, the daily run sheet, event close-out | Jira-style boards for facilities (sprints, epics, reports), until the facilities lead says they need them |
| IT & Maintenance, with the open Jira issues imported, and My work today for the facilities and IT teams | |
| Who's who, the Library (IAR's policies), What's stuck (office and executives), "Request this again" | |
| Beta measures for the portal admins (counts only) | |

Social & Welfare aid goes through Purchase Requests, restricted to S&W and finance; there's no separate module. People show by their names from IAR's Workspace directory, never by email address.

## Before starting

| What | Who | Notes |
| --- | --- | --- |
| An IAR **super admin** to run go-live on their computer (Node 20+, `gcloud` with its beta commands) | Kashif | Signed in with `gcloud auth login` as their @islam1.org account |
| IAR's **billing account** ID | Treasurer | go-live links it after asking |
| Project ID and region | Kashif | Defaults: `iar-portal`, `us-east1` |
| The **members Sheet**, filled in | Office admins | `go-live --template --apply` makes it in your Drive, or upload `ops/go-live/members-template.xlsx`. Tabs: Groups, Pillars, Funds, Cards (last 4 only), Testers, Rooms. It's used once; after launch Google Groups is the record |
| **Testers**: 5–10 people | Kashif | At least one chair, one director, one executive, one finance person, one marketing person, one facilities person and one regular requester |
| The **room list** checked against IAR's room resources, and interim answers on the room-policy gaps (committee room 240 or 280, lead times, which rooms can be booked) | Office | Go in the Sheet's Rooms tab |
| The facilities lead's **Jira CSV export** of open issues, and a one-hour **session with the facilities team** using the questions in [facilities-move.md](facilities-move.md) | Facilities lead, Kashif | The export is imported after deploy; the session decides what else they need before Jira is retired |
| The **Policies Shared Drive**, with the room reservation policy in it | Office, Shura secretary | The Library lists it read-only. Put "Review by YYYY-MM-DD" in a file's Drive description to show its review date |
| A **marketing folder** in a Shared Drive for files people add to marketing requests | Marketing lead | Can be a folder in an existing Shared Drive |
| **Five volunteers** for a usability session in the first beta week, not all of them testers | Kashif | 30 minutes each; see "During the beta" |

## Steps

0. **Check the code going out.** CI is green on the commit being deployed (tests, typecheck, build and the style rules). With `npm --prefix portal run dev` running, `npm --prefix portal run a11y -- --strict` passes on every screen. Look over `npm --prefix portal run shots` (each screen next to the demo, in `portal/.shots/report.html`) for anything that looks wrong.
1. **Make the Sheet and send it to the office.** `npm --prefix ops/go-live install`, then `npm --prefix ops/go-live start -- --template --apply`. Share the Sheet with the office admins (email A in the plan).
2. **Look first.** `npm --prefix ops/go-live start -- --sheet <Sheet link>` lists every change and makes none. If the Sheet has problems (an address that doesn't exist, a committee name changed), it lists them all; fix them in the Sheet and run again.
3. **Apply.** `npm --prefix ops/go-live start -- --apply`. Say yes step by step. The steps done by hand (about 20 minutes), each with exact instructions and a check afterwards:
   - the OAuth consent screen (Internal) and the two sign-in clients;
   - the domain-wide delegation entry for the portal's service account. Its scope list now includes the read-only directory view of people's names (`admin.directory.user.readonly`), so the portal shows names instead of email addresses;
   - the Chat app's configuration, its private Marketplace listing, and installing it for the beta group;
   - the sign-in address on the Web client.
4. **Send the DNS email.** go-live saves a Gmail draft to IAR's DNS manager with the exact records for `portal.islam1.org`. Read it and send it. The beta can start on the Cloud Run address meanwhile; run go-live again later and it switches over once DNS and the certificate work (then update the Chat app's endpoint, which it reminds you of).
5. **Two Shared Drives by hand** (go-live doesn't make these; see [setup.md](setup.md) §7):
   - **Policies drive:** add the portal's runtime service account as a **Viewer**. Portal Settings shows the account's address.
   - **Marketing folder:** add the runtime service account as a **Content manager** and `portal-team-marketing@` as at least a Viewer.
6. **Portal Settings** (signed in as a portal admin, at `/admin`):
   - check every team has a fund, check the cards, turn on the rooms people can book and set food, shared space (the full gym and its halves) and restricted rooms, and check the Chat spaces are listed;
   - **Library:** paste the Policies drive's address under "Library: the Policies drive", and check it says it's connected;
   - **Marketing files:** paste the marketing folder's link;
   - **Event rules:** pick the room reservation policy from the Library (or paste its link), so the event form links it next to "I've read the room reservation policy".
7. **Who's who.** Ask each chair to open their team's page in Who's who and add a line on what the team handles and its Google Chat space link. Until they do, the page shows its chair and vice chair only.
8. **Import Jira.** The facilities lead or an admin uploads the CSV at `/it-maintenance/import`, checks the preview, and imports.
9. **One-room check** with a test room before inviting anyone: submit an event in it; the tentative hold appears on that room's Google Calendar; a time over Zuhr is flagged; approval confirms the hold; cancelling removes it.
10. **Check the daily job and alerts.** The daily job `portal-daily` runs at **7:00 AM** Raleigh time; keep it there, because alerts held overnight and the morning digests go out with it. go-live also set up the alerts that email `portal-role-admin@`: the sign-in page's uptime check, server errors, and the portal failing to reach Google (Groups, Calendar, Chat, Drive or Gmail).
11. **Smoke test** (below), then **go live**: run go-live again and say yes to step 13, which adds the testers to `portal-role-beta@`.

## Smoke test

Use testers in these roles: A (a committee member), B (that committee's chair), D (its director), E (an executive), F (finance), M (marketing), S (facilities), O (office). Every step of a request needs someone in `portal-role-beta@`.

**Sign-in and alerts**
- [ ] Someone **not** in `portal-role-beta@` signs in and sees "open to a small group of testers".
- [ ] A tester already signed in to Google goes straight in, with no account picker.
- [ ] On a computer the menu is a sidebar; on a phone it opens as a drawer from the left, and no page scrolls sideways.
- [ ] People show by name everywhere (Waiting on, history, Who's who), never by email address.
- [ ] Light, dark and "Match my device" in the account menu all read clearly.
- [ ] Each module shows a short "How this works" box; hiding it sticks. Home shows What's new once.
- [ ] The IAR Portal app sends B a Chat message when something waits on B, and posts in the Finance space when a request reaches finance.

**Purchase Requests**
- [ ] A submits a $25 reimbursement with a receipt. The receipt lands in the PO Records drive under `<year> / PO-12001 · <fund>`.
- [ ] B gets a Chat message within a minute and approves; the Finance space gets a post; F returns it for changes and A gets a Chat message.
- [ ] Searching `12001` from the top bar finds it.
- [ ] B turns on Out of office with C covering. C gets a Chat message, approves one, and its history says "for B".
- [ ] On the request page, the step bar and "What happens next" are right for A, for B and for F (each reads "You" only at their own step).
- [ ] F pays two approved requests at once on the Finance desk, enters them in QuickBooks, and downloads the CSV; the CSV opens in a spreadsheet with one row per line item.
- [ ] A uses "Request this again" on a paid request: the form opens filled in, with no receipts.

**Events & Rooms**
- [ ] A finds a room on the Calendar's "Find a room" for 60 people with food; "Request this room" opens the event form with the date, times and room filled in.
- [ ] A requests a one-time event. The checks flag a prayer or school-hours clash; A moves the time and it's all clear. The room policy link opens the policy from the Library.
- [ ] A starts an event request, reloads the page, and is offered "Pick up where you left off".
- [ ] On submit, "Hold (pending approval)" appears on the room's Google Calendar. D gets a Chat message, approves; the Executive space gets a post; E approves and the hold is confirmed.
- [ ] A weekly series (up to 3 months) books only its dates; a clash on one date is listed by date.
- [ ] 30 days before a series ends, its requester gets a Chat message; "Request the next period" opens the form with the next dates filled in.
- [ ] A asks for a time someone else booked. They give it up; the dates leave the calendar at once and A's request moves on.
- [ ] Food in a room that doesn't allow it, or attendance over capacity, is flagged to the reviewers.
- [ ] Once approved, the event's tasks appear in Team Queues for marketing, A/V and security.
- [ ] The run sheet for that day lists it, with the calendar's other bookings; security records the room check before and after.
- [ ] After the event, the daily job moves it to close-out; A records attendance; the linked purchase shows as actual spend.
- [ ] The approved event shows on the Calendar's week view for its room and committee.

**Marketing Requests**
- [ ] A asks for a graphic with a logo attached. The Marketing space gets a post; the logo is in the marketing folder under `<year> / MK-… · Graphic design`. M asks a question; A answers; M schedules it with a done-by date, starts and finishes it; A hears at each step.

**IT & Maintenance**
- [ ] A reports a leak with a photo. The Facilities space gets a post; the photo is in the Maintenance Photos drive.
- [ ] S takes it, marks it waiting on parts, then fixed. A gets a Chat message to confirm, and confirms.
- [ ] An imported Jira issue is on the facilities board.
- [ ] On S's phone, My work today lists the leak; "Start", "Waiting on parts" and "Mark fixed" each work with one tap.

**Everything**
- [ ] Feedback from any page reaches `portal-role-admin@` and shows at `/feedback`.
- [ ] O sees a request waiting over a week in What's stuck, sends a reminder, and the person it waits on gets a Chat message.
- [ ] Who's who lists every committee with its chair; the Library lists the policies, and searching the Library for a word from inside one finds it.
- [ ] A tester sets updates to "In the morning digest" in Notification settings; the next morning's digest includes them.
- [ ] Beta measures (`/admin/measures`) shows the test requests in this week's counts.
- [ ] The daily job ran this morning (`gcloud scheduler jobs describe portal-daily --location us-east1` shows a recent success).
- [ ] Cloud Run logs (`gcloud run services logs read iar-portal --region us-east1`) show no "failed" lines.

Delete the test requests' Drive files afterwards; the requests themselves stay as cancelled.

## During the beta

- **Watch five people use it** in the first week, 30 minutes each, on their own phone or computer. Give each the same five tasks, without help: request an event, get reimbursed for a receipt, report a broken light, approve a request as a chair, and find a free room for Saturday evening. Write down where they hesitate or ask a question, and fix those first.
- **Every week:** read the feedback at `/feedback` and the counts at `/admin/measures`: where requests wait longest, how often they're sent back, and which forms people start but don't send. Check What's stuck for anything over a week.
- **Facilities:** after the session with the facilities team, run IT & Maintenance and Jira side by side for two weeks, with My work today on their phones.
- **Changes during the beta:** add a line to What's new (`portal/src/lib/whats-new.ts`) so testers know what to try, and run `npm run a11y` and `npm run shots` before each deploy.

## Turning it off

To pause the beta, remove the testers from `portal-role-beta@`; they lose access within 15 minutes. To take the portal down entirely, delete the service with `gcloud run services delete iar-portal --region us-east1`. Firestore data, Drive files and the calendars stay and can be reused. Bookings made through the portal stay on the room calendars until they're removed there.

## After the beta

- **Production:** `go-live --production` opens the portal to every islam1.org account (it asks first). Install the Chat app for everyone in the Admin console.
- **Facilities off Jira:** run IT & Maintenance and Jira side by side for two weeks, then retire Jira. If the facilities lead needs boards, sprints or reports, those come next (the demo shows them).
- **People:** Google Groups is the record. A Members page in the portal, where chairs manage their own committee, is the planned next step, so nobody needs the Admin console for it.
