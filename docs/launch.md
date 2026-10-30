# Launching and running the portal

The portal is live at https://portal.islam1.org for everyone at IAR, payment requests included.

This is how the portal was put on IAR's Google Cloud, and how to set it up again or check it. One command, **go-live** (`ops/go-live/`, see its [README](../ops/go-live/README.md)), does the setup. It runs on an IAR super admin's computer, shows every change before making it, and is safe to run again. [setup.md](setup.md) describes each step by hand, as a reference and a fallback.

**Ground rules:**
- Everything goes in IAR's Google organization (islam1.org): IAR's Cloud project, IAR's Workspace, IAR's billing account. Never a personal account or project, and never any host except Cloud Run in IAR's project.
- **Never create or download a service account key.** The portal signs its own tokens.
- go-live **asks separately** before anything that costs money, widens access or may email people: linking billing, a license for `portal@`, the delegation scopes, the budget, adding the testers, and opening the portal to everyone.
- **This repo is public.** Names, emails and roles live in Google Groups; funds, cards and room settings live in Portal Settings (Firestore). Card entries hold only the last four digits. The members Sheet stays in IAR's Drive, never in the repo.
- Keep the old Requisition form running until purchase requests go live, and Jira alongside IT & Maintenance until facilities has moved. Nobody loses a way to get paid or get help.

## What's live

| Live | Not yet |
| --- | --- |
| Sign-in with @islam1.org for everyone; alerts in Google Chat, with each person's notification choices and quiet overnight | Facility rentals and the public rental page |
| Home ("Waiting on you", Today at IAR, What's new), My Requests, Search, Help, Feedback, Out of office | Budget and Shura dashboard: still being designed |
| Purchase Requests (pay, reimburse, card receipts), with reminders, a morning digest and the Finance desk | Library beyond policies (Shura documents, each committee's drive) |
| Events & Rooms on IAR's room calendars, with asks for a booked time; the Calendar and Find a room | Asset tracker |
| Marketing Requests with file uploads, Team Queues, the daily run sheet, event close-out | Jira-style boards for facilities (sprints, epics, reports), until the facilities lead says they need them |
| IT & Maintenance, with the open Jira issues imported, and My work today for the facilities and IT teams | |
| Who's who, the Library (IAR's policies), What's stuck (office and executives), "Request this again" | |
| Portal measures for the portal admins (counts only) | |

Social & Welfare aid goes through Purchase Requests, restricted to S&W, finance and the executives; there's no separate module. People show by their names from IAR's Workspace directory, never by email address.

## Setting it up from scratch

Only needed to rebuild the portal in a new project. For the live portal, go-live is run again only when its setup changes.

### Before starting

| What | Who | Notes |
| --- | --- | --- |
| An IAR **super admin** to run go-live on their computer (Node 20+, `gcloud` with its beta commands) | Super admin | Signed in with `gcloud auth login` as their @islam1.org account |
| IAR's **billing account** ID | Treasurer | go-live links it after asking |
| Project ID and region | Super admin | Defaults: `iar-portal`, `us-east1` |
| The **members Sheet**, filled in | Office admins | `go-live --template --apply` makes it in your Drive, or upload `ops/go-live/members-template.xlsx`. Tabs: Groups, Pillars, Funds, Cards (last 4 only), Testers, Rooms. It's used once; after launch Google Groups is the record |
| **Testers**: 5–10 people | Super admin | They try new parts of the portal first. At least one chair, one finance person and one regular requester |
| The **room list** checked against IAR's room resources, and interim answers on the room-policy gaps (committee room 240 or 280, lead times, which rooms can be booked) | Office | Go in the Sheet's Rooms tab |
| The facilities lead's **Jira CSV export** of open issues, and a one-hour **session with the facilities team** using the questions in [facilities-move.md](facilities-move.md) | Facilities lead, super admin | The export is imported after deploy; the session decides what else they need before Jira is retired |
| The **Policies Shared Drive**, with the room reservation policy in it | Office, Shura secretary | The Library lists it read-only. Put "Review by YYYY-MM-DD" in a file's Drive description to show its review date |

### Steps

0. **Check the code going out.** CI is green on the commit being deployed (tests, typecheck, build and the style rules). With `npm --prefix portal run dev` running, `npm --prefix portal run a11y -- --strict` passes on every screen. Look over `npm --prefix portal run shots` (each screen in light and dark, desktop and phone, in `portal/.shots/report.html`) for anything that looks wrong.
1. **Make the Sheet and send it to the office.** `npm --prefix ops/go-live install`, then `npm --prefix ops/go-live start -- --template --apply`. Share the Sheet with the office admins (email A in the plan).
2. **Look first.** `npm --prefix ops/go-live start -- --sheet <Sheet link>` lists every change and makes none. If the Sheet has problems (an address that doesn't exist, a committee name changed), it lists them all; fix them in the Sheet and run again.
3. **Apply.** `npm --prefix ops/go-live start -- --apply`. Say yes step by step. The steps done by hand (about 20 minutes), each with exact instructions and a check afterwards:
   - the OAuth consent screen (Internal) and the two sign-in clients;
   - the domain-wide delegation entry for the portal's service account. Its scope list now includes the read-only directory view of people's names (`admin.directory.user.readonly`), so the portal shows names instead of email addresses;
   - the Chat app's configuration, its private Marketplace listing, and installing it for everyone (or the testers first);
   - the sign-in address on the Web client.
4. **Add the DNS record.** go-live shows the record for `portal.islam1.org` (a CNAME `portal` → `ghs.googlehosted.com`). Add it in islam1.org's DNS, or ask IAR's web admin to; on Cloudflare, set it to DNS only (grey cloud). The portal works on its Cloud Run address meanwhile; run go-live again later and it switches over once DNS and the certificate work (then update the Chat app's endpoint, which it reminds you of).
5. **The Policies drive by hand** (go-live doesn't make it; it makes the receipts, W-9, maintenance photos and marketing drives itself; see [setup.md](setup.md) §7): add the portal's runtime service account as a **Viewer**. Portal Settings shows the account's address.
6. **Portal Settings** (signed in as a portal admin, at `/admin`):
   - check every team has a fund, check the cards, turn on the rooms people can book and set food, shared space (the full gym and its halves) and restricted rooms, and check the Chat spaces are listed. If an older setup made an "IAR Portal · Security" space, archive it in Google Chat and remove `security` from `chatSpaces`: the portal no longer sends Security anything;
   - **Library:** paste the Policies drive's address under "Library: the Policies drive", and check it says it's connected;
   - **Event rules:** pick the room reservation policy from the Library (or paste its link), so the event form links it next to "I've read the room reservation policy".
7. **Who's who.** Ask each chair to open their team's page in Who's who and add a line on what the team handles and its Google Chat space link. Until they do, the page shows its chair and vice chair only.
8. **Import Jira.** The facilities lead or an admin uploads the CSV at `/it-maintenance/import`, checks the preview, and imports.
9. **One-room check** with a test room before inviting anyone: submit an event in it; the tentative hold appears on that room's Google Calendar; a time over Zuhr is flagged; approval confirms the hold; cancelling removes it.
10. **Check the daily job and alerts.** The daily job `portal-daily` runs at **7:00 AM** Raleigh time; keep it there, because alerts held overnight and the morning digests go out with it. go-live also set up the alerts that email `portal-role-admin@`: the sign-in page's uptime check, server errors, and the portal failing to reach Google (Groups, Calendar, Chat, Drive or Gmail).
11. **Smoke test** (below), then **go live**: run go-live with `--production` and say yes to step 13, which opens the portal to every islam1.org account. Without `--production`, step 13 only adds the Sheet's testers to `portal-role-beta@`, and only they and the admins can sign in. Install the Chat app for everyone in the Admin console.

## Smoke test

Use people in these roles: A (a committee member), B (that committee's chair), D (its director), E (an executive), F (finance), M (marketing), S (facilities), O (office).

**Sign-in and alerts**
- [ ] Someone signed in to Google with an @islam1.org account goes straight in, with no account picker; a personal Gmail account is turned away.
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
- [ ] Once approved, the event's A/V task appears in Team Queues and its marketing task in Marketing Requests → Team work. There is no Security task.
- [ ] The run sheet for that day lists it, with the calendar's other bookings.
- [ ] After the event, the daily job moves it to close-out; A records attendance; the linked purchase shows as actual spend.
- [ ] The approved event shows on the Calendar's week view for its room and committee.

**Marketing Requests**
- [ ] A asks for a graphic with a logo attached. The Marketing space gets a post; the logo is in the Marketing Files drive under `Graphic design / <year> / MK-…`. It shows as New in Marketing Requests → Team work for M; M asks a question; A answers; M schedules it with a done-by date, starts and finishes it; A hears at each step.

**IT & Maintenance**
- [ ] A reports a leak with a photo. The Facilities space gets a post; the photo is in the Maintenance Photos drive.
- [ ] S takes it, marks it waiting on parts, then fixed. A gets a Chat message to confirm, and confirms.
- [ ] An imported Jira issue is on the facilities board.
- [ ] On S's phone, My work today lists the leak; "Start", "Waiting on parts" and "Mark fixed" each work with one tap.

**Everything**
- [ ] Feedback from any page reaches `portal-role-admin@` and shows at `/feedback`.
- [ ] O sees a request waiting over a week in What's stuck, sends a reminder, and the person it waits on gets a Chat message.
- [ ] Who's who lists every committee with its chair; the Library lists the policies, and searching the Library for a word from inside one finds it.
- [ ] Someone sets updates to "In the morning digest" in Notification settings; the next morning's digest includes them.
- [ ] Portal measures (`/measures`) shows the test requests in this week's counts.
- [ ] The daily job ran this morning (`gcloud scheduler jobs describe portal-daily --location us-east1` shows a recent success).
- [ ] Cloud Run logs (`gcloud run services logs read iar-portal --region us-east1`) show no "failed" lines.

Delete the test requests' Drive files afterwards; the requests themselves stay as cancelled.

## Running it

- **Every week:** read the feedback at `/feedback` (reply there; the sender hears in Chat) and the counts at `/measures`: where requests wait longest, how often they're sent back, and which forms people start but don't send. Check What's stuck for anything over a week.
- **Changes:** merging a pull request that changes `portal/` deploys it (Cloud Build → History shows each one). Add a line to What's new (`portal/src/lib/whats-new.ts`) for anything people will notice.
- **Facilities:** run IT & Maintenance and Jira side by side for two weeks, with My work today on their phones, then retire Jira. If the facilities lead needs boards, sprints or reports, those come next.
- **People:** Google Groups is the record. A Members page in the portal, where chairs manage their own committee, is the planned next step, so nobody needs the Admin console for it.

## Turning it off

To limit sign-in to the testers again, run go-live without `--production` after removing `production` from `ops/go-live/.state.json`; to take the portal down entirely, delete the service with `gcloud run services delete iar-portal --region us-east1`. Firestore data, Drive files and the calendars stay and can be reused. Bookings made through the portal stay on the room calendars until they're removed there.

