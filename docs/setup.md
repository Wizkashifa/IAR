# Portal setup

How to run the portal locally and how to stand it up on IAR's Google Cloud. Everything below is created under IAR's organization (islam1.org), never a personal account.

## Run it locally (no Google setup needed)

```
cd portal
npm install
npm run dev
```

Open http://localhost:3000. `npm run dev` turns on dev mode: there is no Google sign-in, requests are sample data held in memory, and http://localhost:3000/dev lets you switch between sample users (volunteer, chair, office, finance, marketing, admin) to see how the home page changes by group. Dev mode switches itself off on Cloud Run.

## One-time Google setup

**go-live does all of this** (`ops/go-live/`, see its [README](../ops/go-live/README.md) and [launch.md](launch.md)): it shows every change first, asks before each step, and checks the steps Google makes you do by hand. The sections below are the same steps by hand, as a reference and a fallback. Done once by a Workspace super admin who can create projects in the islam1.org Cloud organization. The names are the ones go-live uses.

### 1. Google Cloud project

1. In the Google Cloud console, create a project under the **islam1.org** organization, for example `iar-portal`, and attach billing.
2. Enable these APIs: Cloud Run, Cloud Build, Artifact Registry, Firestore, Secret Manager, IAM, IAM Service Account Credentials, Admin SDK, Drive (receipts, W-9s, maintenance photos), Gmail (fallback emails), Calendar (room bookings), Chat (alerts), Cloud Scheduler (the daily job), Cloud Storage (backups) and Monitoring (uptime alert). go-live also uses Groups Settings, Sheets, Licensing, Billing Budgets and the Marketplace SDK.

```
gcloud config set project iar-portal
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com secretmanager.googleapis.com iam.googleapis.com iamcredentials.googleapis.com admin.googleapis.com \
  drive.googleapis.com gmail.googleapis.com calendar-json.googleapis.com chat.googleapis.com \
  cloudscheduler.googleapis.com storage.googleapis.com monitoring.googleapis.com
```

### 2. Firestore

Create the database in Native mode, in the region the app will run in (us-east1 is closest to Raleigh), then add the index My Requests needs:

```
gcloud firestore databases create --location=us-east1
gcloud firestore indexes composite create --collection-group=cards \
  --field-config=field-path=ownerEmail,order=ascending \
  --field-config=field-path=updatedAt,order=descending
```

Purchase Requests also needs this index, for the finance office's monthly card-receipts checklist:

```
gcloud firestore indexes composite create --collection-group=cards \
  --field-config=field-path=type,order=ascending \
  --field-config=field-path=createdAt,order=ascending
```

Notifications (the bell) need one more:

```
gcloud firestore indexes composite create --collection-group=notifications \
  --field-config=field-path=to,order=ascending \
  --field-config=field-path=at,order=descending
```

Turn on point-in-time recovery: `gcloud firestore databases update --database='(default)' --enable-pitr`.

Cards (purchases `PO-12001`…, events `EV-1101`…, marketing `MK-1001`…, IT & maintenance `TK-1001`…) are stored at `orgs/iar/cards/{cardId}`, preventive maintenance schedules at `orgs/iar/ticketSchedules/{id}`, saved payees at `orgs/iar/vendors/{vendorId}`, and request-number counters at `orgs/iar/counters/{prefix}` (purchase requests start at PO-12001, after the old form's numbers). Notifications are at `orgs/iar/notifications`, each person's notification settings at `orgs/iar/notifyPrefs/{email}`, alerts held overnight (quiet hours) at `orgs/iar/heldAlerts`, out-of-office handoffs at `orgs/iar/away/{email}`, feedback (with replies) at `orgs/iar/feedback`, the log of portal admins signing in as someone to troubleshoot (Portal Settings → Sign in as someone) at `orgs/iar/audit`, and asks for a booked time slot at `orgs/iar/slotRequests` (numbered from SR-1001). If Firestore asks for another index the first time a page loads, the error in the Cloud Run log includes a link that creates it.

### 3. Runtime service account

```
gcloud iam service-accounts create portal-runtime --display-name="IAR portal runtime"
SA=portal-runtime@iar-portal.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding iar-portal --member=serviceAccount:$SA --role=roles/datastore.user
gcloud projects add-iam-policy-binding iar-portal --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
# Lets the app sign its own JWT for group lookups, so no key file is ever created:
gcloud iam service-accounts add-iam-policy-binding $SA --member=serviceAccount:$SA --role=roles/iam.serviceAccountTokenCreator
```

A second service account, `portal-scheduler`, runs the daily job (§11). It needs only `roles/run.invoker` on the service.

### 4. Domain-wide delegation: groups, rooms, calendars and email

The portal acts as two Workspace users, through its service account and no key:
- `portal-directory@islam1.org` reads, read-only, which Google Groups a person is in, who is in each `portal-team-*` and `portal-pillar-*` group with their role (Owner, Manager, Member), people's names from the public directory, and IAR's room resources.
- `portal@islam1.org` (the portal's mailbox, §8) puts room holds on the room calendars and sends the fallback emails.

1. Create `portal-directory@islam1.org`, a user just for this. Give it a custom admin role, "Portal reader", that can only read (Admin console → Account → Admin roles → create role → Admin API privileges → Groups → Read; Calendar resources → Read; Buildings → Read). Don't use a super admin. It needs no license.
2. Find the service account's numeric **Unique ID** (`gcloud iam service-accounts describe $SA --format='value(uniqueId)'`).
3. Admin console → Security → Access and data control → API controls → Manage domain-wide delegation → Add new: that Unique ID, with these five scopes, comma-separated:
   - `https://www.googleapis.com/auth/admin.directory.group.readonly` (groups, as `portal-directory@`)
   - `https://www.googleapis.com/auth/admin.directory.resource.calendar.readonly` (rooms, as `portal-directory@`)
   - `https://www.googleapis.com/auth/admin.directory.user.readonly` (people's names, as `portal-directory@`; the portal asks only for the public directory view, so the "Portal reader" role needs no user privilege)
   - `https://www.googleapis.com/auth/calendar.events` (room holds, as `portal@`)
   - `https://www.googleapis.com/auth/gmail.send` (fallback emails, as `portal@`)
4. The portal's `DIRECTORY_ADMIN_SUBJECT` is `portal-directory@`; `PORTAL_MAIL_FROM` and `PORTAL_CALENDAR_SUBJECT` are `portal@`.

Be aware: delegation applies to the service account, not to one user, so these scopes would let it act as any islam1.org user. The portal only ever acts as the two users above, the service account has no key file, and only the Cloud Run service runs as it. Keep the project's owners to two named people.

### 5. Google sign-in

1. APIs & Services → OAuth consent screen: user type **Internal** (only islam1.org accounts can sign in), app name "IAR Portal".
2. Credentials → Create OAuth client ID → Web application. (go-live also needs a **Desktop app** client for its own sign-in; save its JSON as `ops/go-live/client_secret.json`, which is gitignored.) Authorized redirect URI: `https://<portal address>/api/auth/callback/google` (add `http://localhost:3000/api/auth/callback/google` to test real sign-in locally).
3. Store the secrets:

```
printf '%s' "<client secret>" | gcloud secrets create google-client-secret --data-file=-
openssl rand -base64 32 | tr -d '\n' | gcloud secrets create nextauth-secret --data-file=-
```

### 6. Groups: committees, teams, directors and roles

Everything about people lives in Google Groups. Nobody edits code or files to assign anyone: add, remove or promote people in Admin console → Directory → Groups, and the portal picks it up within 15 minutes. Anyone with an islam1.org account gets My Requests and the request modules without a group.

Every portal group is named **`portal-<kind>-<slug>@islam1.org`**. The launch teams' slugs are the ones IAR chose (below; some are short, like `tech` for IT Services). For a team added later, or a pillar, the slug comes from the name: lowercase it, drop apostrophes, "&" and the word "Committee", and join the words with hyphens ("Women's Committee" → `women`). The group's display name is exactly what the portal shows.

**Team groups: one per committee or team** (`portal-team-<slug>@`). Committees and teams work the same way. In each group:

| Group role | In the portal |
| --- | --- |
| Owner | Chair: approves the committee's requests and sees all of them. Several Owners are co-chairs; any of them can approve |
| Manager | Vice chair: the backup approver when the chair submits a request or is away; sees all of them |
| Member | Member: can request events, marketing and purchases for the committee |

A person can be on any number of teams, with a different role in each. Chairing one never makes them chair of another. The portal finds every `portal-team-*` group by itself, so a new committee is just a new group. Then pick its fund in Portal Settings (step 7).

The launch list (26; Outreach is part of Da'wah):

| Team | Group | Also gives |
| --- | --- | --- |
| Administration | portal-team-administration@ | |
| Al-Furqan School | portal-team-al-furqan-school@ | |
| Al-Iman School | portal-team-al-iman-school@ | |
| An-Noor School | portal-team-an-noor-school@ | |
| Cemetery | portal-team-cemetery@ | |
| Cleaning | portal-team-cleaning@ | |
| Construction | portal-team-construction@ | |
| Da'wah | portal-team-dawah@ | |
| Education | portal-team-education@ | |
| Events Committee | portal-team-events@ | |
| Facility Maintenance | portal-team-maintenance@ | IT & Maintenance (facilities), run sheet |
| Fundraising | portal-team-fundraising@ | |
| Health & Wellness | portal-team-hw@ | |
| IAR Cafe | portal-team-cafe@ | |
| Imam Office | portal-team-imams@ | |
| IT Services | portal-team-tech@ | IT & Maintenance (IT, and A/V tasks for events) |
| Marketing | portal-team-marketing@ | Marketing requests and event marketing (Marketing Requests → Team work) |
| Older Adult Community | portal-team-seniors@ | |
| Page Road | portal-team-page@ | |
| Safety & Security | portal-team-security@ | |
| Shura | portal-team-shura@ | Shura dashboard (later) |
| Social & Welfare | portal-team-welfare@ | Restricted S&W purchase requests and payees |
| Sports & Recreation | portal-team-sports@ | |
| Volunteer | portal-team-volunteer@ | |
| Women's Committee | portal-team-women@ | |
| Youth | portal-team-youth@ | |

The six teams in the last column switch on modules, so their slugs are in the code (`QUEUE_ROLES` in `portal/src/lib/teams.ts`): changing one of those six addresses means a code change. The launch list itself (`TEAM_SLUGS`) is only what go-live creates; the portal reads every team from Google, so any other team can be renamed or added freely.

**Pillar groups: one per director** (`portal-pillar-<slug>@`). The Owner is the director (several Owners are co-directors). The members are the team groups the pillar covers: add the team groups themselves as members, not people. A director:
- sees every request from those committees, except Social & Welfare's restricted ones
- can approve at the chair step alongside the chair, recorded "as director"
- gets the request when the committee has no chair, or when the chair submitted it and there's no vice chair
- can submit for those committees without being a member
- never approves their own request, and never finance, payment or executive steps

To change a director, change the pillar's Owner. To move a committee to another pillar, move its group.

**Role groups: portal-wide jobs** (`portal-role-<job>@`). Members only.

| Group | Unlocks |
| --- | --- |
| portal-role-office@ | Rentals, run sheet; can submit for any committee |
| portal-role-finance@ | Finance review, payment, QuickBooks entry, restricted S&W requests; can submit for any fund |
| portal-role-executive@ | Whoever holds an executive office (Head Imam, Shura chair, CEO; one person can hold several): final mission review of events, and executive approvals. When an office changes hands, change the group's members |
| portal-role-admin@ | Every module and Portal Settings, for support. Never approves or pays. Keep to two or three people |
| portal-role-beta@ | The testers ("Portal: Testers"). While `PORTAL_ACCESS_GROUP` is set, only this group and the admins can sign in. Add testers directly, not through nested groups |

**Group settings.** In every team and pillar group, set "Who can manage members" to owners only (or admins only). Otherwise a manager could add people to a committee, which would let them request from its fund.

**If older groups exist** (`portal-office@` and the like, from an earlier setup), rename them in the Admin console rather than making new ones. Google keeps the old address as an alias.

Portal admins can see every module for support, but being an admin never lets anyone approve or pay: those need membership in that group or team itself (`actingRoles` in `portal/src/lib/viewer.ts`). The rules are plain functions with tests in `portal/src/lib/teams.ts`.

### 7. Shared Drives, funds and cards

1. **Receipts drive.** Create a Shared Drive under islam1.org, for example "PO Records", and add the runtime service account (`$SA`) as a **Content manager**. Make a top-level folder in it for the portal and copy its ID from the URL; that is `PO_DRIVE_FOLDER_ID`. The portal files each request's receipts and invoices as `<year> / PO-12001 · <fund>`. Give finance and the office access through their groups, not individuals, and `portal-role-executive@` Viewer access, so executives can open the card receipts and statements they see in the portal. Retention (seven years) is a yearly review by the office, as in the plan.
2. **W-9 drive.** A separate, restricted Shared Drive that only `portal-role-finance@` can open. Add the runtime service account (`$SA`) as a **Contributor** only, so it can add files but not manage the drive. Make a top-level folder for the portal and copy its ID; that is `W9_DRIVE_FOLDER_ID`. When a payment is for labor and the payee has no W-9 on file, the requester must upload one with the request. It is saved there as `W-9 — <payee> — <date>`, and only finance gets a link to it. Finance checks it and ticks "W-9 on file" when approving, which marks the saved vendor so the next request to them needs no W-9. The portal never stores tax ID numbers.
3. **Maintenance Photos drive.** A Shared Drive for IT & Maintenance photos, with the runtime service account as **Contributor**, the facilities and IT team groups as Contributors and the office as Viewer. Make a top-level folder; its ID is `MAINTENANCE_DRIVE_FOLDER_ID`. Photos are filed as `<year> / TK-1001`.
4. **Marketing drive.** A Shared Drive, "Marketing Files", for the files people add to marketing requests: logos, photos, wording. Add the runtime service account (`$SA`) and `portal-team-marketing@` as **Content managers**. Make a top-level folder; its ID is `MARKETING_DRIVE_FOLDER_ID`. Each request gets its own folder, by type and the year it was sent: `<type> / <year> / MK-1004`. Until it's set, the marketing forms take Google Drive links only.
5. **Funds and cards: Portal Settings.** Signed in as a portal admin, open Portal Settings (`/admin`). It lists every team found in Google with its chair, vice chair, director and head count. Pick the fund each team charges; teams whose name matches a fund have it suggested, and the rest show "Needs a fund". Add IAR's cards there too (last four digits, holder, fund). Both are saved in Firestore at `orgs/iar/settings/portal`. There's no file to edit or upload. A team with no fund can't submit purchase requests yet, and a fund no team charges goes straight to finance review.
6. **Executive approval.** Once the Shura sets the dollar amount, set `PO_EXECUTIVE_THRESHOLD` (for example `2500`). Unset means no executive step.
7. **Reminders** come from the daily job (§11): a reminder after 3 days at a step, the committee's director (or finance) after 5, and a weekday morning digest in Chat for each approver and the finance office.
8. **Library: the Policies drive.** The Library lists IAR's Policies Shared Drive for everyone at IAR, read-only; files open in Google Drive and the portal keeps no copies. Add the runtime service account (`$SA`) to that drive as a **Viewer**, then in Portal Settings → "Library: the Policies drive" paste the drive's address from the browser. The portal reads it as itself with the read-only Drive scope (`drive.readonly`); no domain-wide delegation is involved. To show a policy's review date, write "Review by 2027-01-31" in the file's description in Drive. The event form links the room policy from the Library when no link is set in Event rules.

### 8. Alerts in Google Chat

The portal alerts whoever has to act next: an approver when a request reaches them, a requester when it comes back for changes, the person covering for someone away, and a team when there's something new in its queue. A person gets a **direct message from the "IAR Portal" Chat app**; a role or team gets a **post in its Chat space** ("IAR Portal · Finance"), one thread per request. Everything else appears only under Notifications in the portal.

1. **The Chat app** (Cloud console → Google Chat API → Configuration): app name "IAR Portal", the IAR logo as its avatar, interactive features on, "Receive 1:1 messages" and "Join spaces and group conversations" ticked; connection: **HTTP endpoint URL** `https://<portal address>/api/chat`, authentication audience **HTTP endpoint URL**; visibility: leave "Make this Chat app available to specific people and groups" unticked, so the private Marketplace listing (step 2) makes it available to everyone in islam1.org (tick it and enter `portal-role-beta@` and `portal-role-admin@` only while sign-in is limited to the testers). Don't build it as a Workspace add-on. The app sends as the runtime service account itself (the `chat.bot` scope); there's no key and no delegation for it.
2. **List it privately** (Google Workspace Marketplace SDK → App configuration: visibility Private, Individual + Admin Install (Chat apps can't be admin-only); App integrations: Chat app; then the store listing and Publish; private listings aren't reviewed by Google), and **install it** for everyone (open the Google Workspace Marketplace at workspace.google.com/marketplace, search "IAR Portal", Admin install; or certain groups while sign-in is limited to the testers). Installing it is what lets the app message people.
3. **Spaces**: one per role or queue team (Finance, Office, Executive, Admins, Marketing, IT & A/V, Facilities), with that team's Google Group added as a member so the space follows the group, and the app added. Save each space's name (`spaces/AAAA…`) in Portal Settings `chatSpaces`, keyed by role (`finance`, `office`, `executive`, `admins`, `marketing`, `it`, `av`, `facilities`). A role with no space gets its alerts by email to its group.
4. Set `PORTAL_CHAT=on` when deploying.

**Email is the fallback**, for someone the app can't reach yet (it isn't installed for them):
1. The mailbox `portal@islam1.org` needs a license (it also holds the room calendars' holds, §10); a mailbox nobody signs in to is fine.
2. The `gmail.send` scope is in the delegation entry (§4).
3. Set `PORTAL_MAIL_FROM=portal@islam1.org` when deploying. `PORTAL_EMAIL_FALLBACK=off` turns the fallback off.
4. Let `portal@islam1.org` post to the groups it may email (`portal-role-finance@`, `-executive@`, `-office@`, `-admin@`, and the team groups with a queue): "Who can post" must include that address or the whole organization.

To try it locally without Google, run `npm run dev`; every Chat message and email the portal would send is listed at http://localhost:3000/dev.

### 9. Deploy

From the repo root:

```
gcloud run deploy iar-portal --source portal --region us-east1 \
  --service-account $SA --allow-unauthenticated \
  --set-env-vars ORG_DOMAIN=islam1.org,GOOGLE_CLIENT_ID=<client id>,DIRECTORY_ADMIN_SUBJECT=portal-directory@islam1.org,DIRECTORY_SERVICE_ACCOUNT=$SA,NEXTAUTH_URL=https://<portal address>,PO_DRIVE_FOLDER_ID=<folder id>,W9_DRIVE_FOLDER_ID=<W-9 folder id>,MAINTENANCE_DRIVE_FOLDER_ID=<photos folder id>,PORTAL_MAIL_FROM=portal@islam1.org,PORTAL_CALENDAR_SUBJECT=portal@islam1.org,PORTAL_CHAT=on,DAILY_INVOKER=portal-scheduler@iar-portal.iam.gserviceaccount.com,PORTAL_ACCESS_GROUP=portal-role-beta@islam1.org \
  --set-secrets GOOGLE_CLIENT_SECRET=google-client-secret:latest,NEXTAUTH_SECRET=nextauth-secret:latest
```

Leave out `PORTAL_ACCESS_GROUP` to open the portal to every islam1.org account; set it to limit sign-in to the testers. `--allow-unauthenticated` lets the sign-in page load; every other page requires an islam1.org Google sign-in inside the app. If the organization's "Domain restricted sharing" policy blocks it, override that policy for this project only. After the first deploy, set `NEXTAUTH_URL` and the OAuth redirect URI to the service URL and deploy again.

**Later changes deploy themselves** once go-live's extra step is run (`npm --prefix ops/go-live start -- --only autodeploy --apply`): a Cloud Build trigger in this project deploys each change to `portal/` merged into `main`, after its tests pass (`portal/cloudbuild.yaml`), as `portal-deployer@`, which can only push the image and add a revision. See "Deploying changes" in `ops/go-live/README.md`.

Add the portal to the **Google app launcher** (the 9-dot menu in Gmail and Drive): Admin console → Apps → Web and mobile apps → Add custom app (a bookmark to the portal's address), for everyone.

### 10. Room calendars

IAR's rooms are resources in Google Workspace (Admin console → Directory → Buildings and resources), each with its own calendar. The portal reads the list from there and checks bookings against each room's calendar; nothing about rooms is typed into the portal except what Google doesn't hold.

1. Check the resources against the real room list with the office: every bookable room is a resource with its building and capacity. Add missing ones there.
2. Share each room's calendar, and IAR's main events calendar, with `portal@islam1.org` with **Make changes to events**. The portal puts a "Hold (pending approval)" on the room calendar when a request is submitted, confirms it on approval and removes it if the request is sent back, denied or cancelled.
3. Make sure the daily prayers, Jumuah, school hours (Al-Iman, An-Noor, Al-Furqan) and the food pantry are on the room calendars as recurring events. The portal treats them like any other booking: they show on the calendar and the run sheet, and a request that clashes with one is flagged.
4. In Portal Settings → Rooms, turn on the rooms people can book, and set food, rooms that share a space (the full gym and its halves) and restricted rooms (Room 240). Policy rules can be turned off there too.

### 11. The daily job, backups and alerts

1. **Daily job**: a Cloud Scheduler job `portal-daily` at 7:00 AM America/New_York, POST `https://<portal address>/api/daily`, with an OIDC token as `portal-scheduler@…` (which has `roles/run.invoker`) and audience `https://<portal address>/api/daily`. Set `DAILY_INVOKER` to that service account. It sends purchase reminders and the morning digest, reminds and escalates unanswered asks for a booked time, moves past events to close-out, opens preventive maintenance tickets and closes tickets the reporter never confirmed. It also sends the alerts held overnight for people with "Quiet overnight" on (9 PM to 7 AM, so the job must stay at 7:00 AM) and the update digests people chose in Notification settings.
2. **Backups**: point-in-time recovery (§2) plus a nightly Firestore export to a Cloud Storage bucket with a 30-day lifecycle.
3. **Alerts**: an uptime check on the sign-in page and an alert policy emailing `portal-role-admin@`; two log-based alerts emailing the same group, one when more than 3 pages fail with a server error (5xx) in five minutes and one when the portal can't reach Google Groups, the room calendars, Chat, Drive or Gmail (log lines with `jsonPayload.portalHealth`; the portal also messages the admins itself, at most every 6 hours per service); a $25/month budget alert on the billing account; an Artifact Registry cleanup policy keeping the last 10 images.

### 12. The address: portal.islam1.org

Map the domain with `gcloud beta run domain-mappings create --service iar-portal --domain portal.islam1.org --region us-east1` (Google may first ask you to prove IAR manages islam1.org: `gcloud domains verify islam1.org`). It prints the DNS records to add (a CNAME `portal` → `ghs.googlehosted.com.`), and go-live shows them too. On Cloudflare, set the record to DNS only. Once DNS and the certificate are ready, set `NEXTAUTH_URL=https://portal.islam1.org`, add `https://portal.islam1.org/api/auth/callback/google` to the Web client's redirect URIs, change the Chat app's endpoint and the daily job's URL and audience, and deploy again.

## Who owns what

- People: Google Groups is the record of who is on which committee and who does what. The members Sheet go-live reads is a one-time starting list, archived after launch.

- Google Cloud project: owned by the islam1.org organization, with at least two project owners.
- Repo: move from the personal GitHub account to an IAR GitHub organization before production.
- Admin role in the portal: the `portal-role-admin` group, not a named person.
