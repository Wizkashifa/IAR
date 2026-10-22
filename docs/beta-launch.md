# Beta launch runbook

How to put the portal on IAR's Google Cloud for a small group of testers. Written so Claude Cowork, working on Kashif's computer, can follow it from start to finish. The technical detail for each step is in [setup.md](setup.md); this page gives the order, what to collect first, where to stop and ask, and how to check each step worked.

**Ground rules for whoever runs this:**
- Everything is created under the **islam1.org** Google organization: IAR's Cloud project, IAR's Workspace. Never use a personal Google account or project, and never deploy anywhere except Cloud Run in IAR's project.
- **Never create or download a service account key.** The portal signs its own tokens.
- **Stop and ask Kashif before** turning on billing, buying a Workspace license, adding domain-wide delegation scopes, or anything that emails people. These cost money or widen access.
- **This repo is public.** Never commit people's names, emails or roles, card numbers, tax IDs or passwords. Who approves what lives in Google Groups (setup §6); which fund each team charges and IAR's cards live in Portal Settings, in Firestore. Card entries hold only the last four digits.
- Keep the old Requisition Form running during the beta. Nobody loses a way to get paid while we test.

## What's in the beta

| In the beta | Not yet |
| --- | --- |
| Sign-in with @islam1.org, limited to the beta group | Events & Rooms (calendar holds): next build. Calendar groundwork is set up below |
| My Requests, Purchase Requests (pay, reimburse, card receipts) | IT & Maintenance: next build. Facilities moves over from Jira |
| Notifications (bell + email to whoever acts next) | Budget and Shura dashboard: still being designed |
| Search, Feedback button, Out of office | Team queues, run sheet, rentals, S&W aid, Library |

## Before starting: collect these

Write them in a note; later steps need them.

| What | Example | Who decides |
| --- | --- | --- |
| Cloud project ID | `iar-portal` | Kashif |
| Region | `us-east1` (closest to Raleigh) | — |
| Billing account | IAR's, not personal | IAR treasurer / Kashif |
| Portal address | Cloud Run URL to start; `portal.islam1.org` later | Kashif |
| Beta testers | 5–10 people, with at least one chair, one finance person and one requester | Kashif |
| Funds the beta will use, each with a chair and a backup approver | `Youth Expenses`: chair + backup | Office |
| IAR cards in the beta (last 4, cardholder, fund) | `2093`, holder, `Imam's Office Fund Expenses` | Finance |
| Executive approval threshold | Leave empty until the Shura sets it | Shura |
| Sending mailbox | `portal@islam1.org` | Kashif |
| Group-read user | `portal-directory@islam1.org` | Kashif |

**Accounts needed on the computer:** a Google Cloud user who can create projects under islam1.org and link billing, and a Workspace super admin for the Admin console steps. Tools: `gcloud` CLI (signed in with `gcloud auth login` as the IAR admin, not a personal account), Node 20 or later, and git with access to this repo.

## Steps

Each step points to the matching section of setup.md. Do them in order and run the check before moving on.

1. **Cloud project and APIs** (setup §1). *Stop and ask before linking billing.*
   Check: `gcloud services list --enabled --project <id>` shows run, firestore, admin, drive, gmail and calendar-json.
2. **Firestore and its three indexes** (setup §2).
   Check: `gcloud firestore indexes composite list` shows cards ×2 and notifications ×1 (they take a few minutes to say READY).
3. **Runtime service account** (setup §3). No keys.
   Check: `gcloud iam service-accounts keys list --iam-account $SA --managed-by=user` is empty.
4. **Group lookups** (setup §4): the read-only directory user and its domain-wide delegation entry. *Stop and ask before adding the delegation.*
5. **Google sign-in** (setup §5): an Internal OAuth consent screen and a web client; secrets go in Secret Manager.
6. **Groups** (setup §6). Members come from Kashif's group sheet.
   - Create the 27 `portal-team-*` groups with their display names. Make each chair an **Owner** and each vice chair a **Manager**; add members as Members.
   - Create one `portal-pillar-*` group per director. Make the director its Owner, and add the team groups they oversee as members.
   - Create the role groups: `portal-role-office@`, `-finance@`, `-executive@` (the Head Imam, the Shura chair and the CEO) and `-admin@` (two or three people, who always get in).
   - Create **`portal-role-beta@islam1.org`** and add each tester to it directly; nested groups aren't checked.
   - In every team and pillar group, set "Who can manage members" to owners only.
7. **Purchase Requests** (setup §7): the PO Records Shared Drive and folder ID, and the restricted W-9 drive (without the service account). Before adding people to groups, check every address marked as guessed in Kashif's sheet in Admin console → Directory → Users, and fix any that don't exist. After the first deploy, an admin opens Portal Settings, picks a fund for every team marked "Needs a fund", and adds IAR's cards.
8. **Email** (setup §8): the sending mailbox, the gmail.send scope and group posting permissions. *Stop and ask before buying the license and before adding the scope.*
9. **Room calendars, groundwork for Events** (below). The beta doesn't use these yet, but doing it now means Events can be switched on without another round in the Admin console.
10. **Deploy** (setup §9). Add `PORTAL_ACCESS_GROUP=portal-role-beta@islam1.org` to `--set-env-vars`. After the first deploy, set `NEXTAUTH_URL` and the OAuth redirect URI to the service URL, then deploy again.
11. **Smoke test** (below), then invite the testers.

## Room calendars (groundwork for Events)

The plan makes IAR's Google Calendar the source of truth for room bookings, with one calendar per room so conflict checks are reliable. Workspace has a built-in way to do this:

1. Admin console → Directory → **Buildings and resources**. Add the buildings (main campus, Page Road), then each bookable room as a resource, with its capacity. The room list and capacities are in the demo (`ROOMS` in `demo/index.html`); confirm them with the office first. The plan's policy gaps list some rooms that are disputed.
2. Each room gets its own resource calendar (an address ending in `@resource.calendar.google.com`). Share each one, plus IAR's main events calendar, with the runtime service account (`$SA`) with **Make changes to events**. Sharing directly means the portal needs no extra domain-wide delegation for Calendar. If Workspace's external-sharing settings only allow free/busy for the service account (it counts as outside the domain), don't loosen them for everyone. Instead, create a `portal-calendar@islam1.org` user, share the calendars with it, and add the scope `https://www.googleapis.com/auth/calendar.events` to the portal's delegation entry for that user. *Ask Kashif before adding the scope.*
3. Record each room's calendar ID next to its room in a sheet in the IAR Operations shared drive. These become the room settings when the Events module is built.
4. Put standing holds on the room calendars as recurring events: prayer times, Jumuah, school hours (Al-Iman, An-Noor, Al-Furqan) and the food pantry. The portal reads them as busy.

Check: in Google Calendar, signed in as an admin, each room calendar shows the service account under "Share with specific people".

## Smoke test after deploy

Use two tester accounts, A (a member of a team) and B (that team's chair, an Owner of its group), plus one finance tester. Every step of a request needs someone in `portal-role-beta@`; anyone else can't sign in to act on it. With the first beta group, that means the bookkeeper in finance and a tester as approver for each fund the requesters use.

- [ ] Someone **not** in `portal-role-beta@` signs in and sees "open to a small group of testers".
- [ ] Portal Settings lists all 27 teams with their chairs, and every team has a fund.
- [ ] A's purchase form offers only A's teams' funds.
- [ ] A submits a $25 reimbursement with a receipt. The receipt lands in the PO Records drive under `<year> / PO-12001 · <fund>`.
- [ ] B gets an email and a notification within a minute, and approves.
- [ ] The finance group address gets the email, and the request is in the finance queue.
- [ ] Finance returns it for changes; A gets an email.
- [ ] Searching `12001` from the top bar finds it.
- [ ] B turns on Out of office with tester C covering. C is emailed, sees B's waiting approvals and approves one; its history says "for B".
- [ ] Feedback from any page reaches `portal-role-admin@` and shows at `/feedback`.
- [ ] Cloud Run logs (`gcloud run services logs read iar-portal --region us-east1`) show no "failed" lines.

Delete the test requests' Drive folders afterwards; the requests themselves stay as cancelled.

## Turning it off

To pause the beta, remove the testers from `portal-role-beta@`; they lose access within 15 minutes. To take the portal down entirely, delete the service with `gcloud run services delete iar-portal --region us-east1`. Firestore data and Drive files stay and can be reused.

## After the beta: facilities from Jira

Facilities (paid staff) works in Jira today and will move into the portal's IT & Maintenance module. Before building it, ask the facilities lead which Jira features they actually use day to day. When it's ready: export open issues from Jira as CSV, import them once, run both side by side for two weeks, then retire Jira. Syncing with Jira (create issues through Jira's API, status updates back by webhook) is the fallback only if moving doesn't work out.
