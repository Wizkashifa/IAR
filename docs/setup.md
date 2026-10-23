# Portal setup

How to run the portal locally and how to stand it up on IAR's Google Cloud. Everything below is created under IAR's organization (islam1.org), never a personal account.

## Run it locally (no Google setup needed)

```
cd portal
npm install
npm run dev
```

Open http://localhost:3000. `npm run dev` turns on dev mode: there is no Google sign-in, requests are sample data held in memory, and http://localhost:3000/dev lets you switch between sample users (volunteer, chair, office, finance, security, admin) to see how the home page changes by group. Dev mode switches itself off on Cloud Run.

## One-time Google setup

Done once by a Workspace super admin and a Google Cloud project owner. Names below are suggestions.

### 1. Google Cloud project

1. In the Google Cloud console, create a project under the **islam1.org** organization, for example `iar-portal`, and attach billing.
2. Enable these APIs: Cloud Run, Cloud Build, Artifact Registry, Firestore, Secret Manager, IAM Service Account Credentials, Admin SDK, Drive (Purchase Requests receipts), Gmail (alert emails) and Calendar (room bookings, for the Events module).

```
gcloud config set project iar-portal
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com admin.googleapis.com \
  drive.googleapis.com gmail.googleapis.com calendar-json.googleapis.com
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

Cards are stored at `orgs/iar/cards/{cardId}`, saved payees at `orgs/iar/vendors/{vendorId}`, and request-number counters at `orgs/iar/counters/{prefix}` (purchase requests start at PO-12001, after the old form's numbers). Notifications are at `orgs/iar/notifications`, out-of-office handoffs at `orgs/iar/away/{email}`, and beta feedback at `orgs/iar/feedback`. If Firestore asks for another index the first time a page loads, the error in the Cloud Run log includes a link that creates it.

### 3. Runtime service account

```
gcloud iam service-accounts create portal-runtime --display-name="IAR portal runtime"
SA=portal-runtime@iar-portal.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding iar-portal --member=serviceAccount:$SA --role=roles/datastore.user
gcloud projects add-iam-policy-binding iar-portal --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
# Lets the app sign its own JWT for group lookups, so no key file is ever created:
gcloud iam service-accounts add-iam-policy-binding $SA --member=serviceAccount:$SA --role=roles/iam.serviceAccountTokenCreator
```

### 4. Let the portal read group membership

The portal reads, read-only, which Google Groups a person is in, and who is in each `portal-team-*` and `portal-pillar-*` group with their role (Owner, Manager, Member). The same "Groups → Read" privilege and scope cover both.

1. Create a Workspace user just for this, for example `portal-directory@islam1.org`. Give it a custom admin role that can only **read groups** (Admin console → Account → Admin roles → create role → Admin API privileges → Groups → Read). Don't use a super admin.
2. Find the service account's numeric **Unique ID** (`gcloud iam service-accounts describe $SA --format='value(uniqueId)'`).
3. Admin console → Security → Access and data control → API controls → Manage domain-wide delegation → Add new: that Unique ID, scope `https://www.googleapis.com/auth/admin.directory.group.readonly`.
4. The portal's `DIRECTORY_ADMIN_SUBJECT` is the user from step 1.

### 5. Google sign-in

1. APIs & Services → OAuth consent screen: user type **Internal** (only islam1.org accounts can sign in), app name "IAR Portal".
2. Credentials → Create OAuth client ID → Web application. Authorized redirect URI: `https://<portal address>/api/auth/callback/google` (add `http://localhost:3000/api/auth/callback/google` to test real sign-in locally).
3. Store the secrets:

```
printf '%s' "<client secret>" | gcloud secrets create google-client-secret --data-file=-
openssl rand -base64 32 | tr -d '\n' | gcloud secrets create nextauth-secret --data-file=-
```

### 6. Groups: committees, teams, directors and roles

Everything about people lives in Google Groups. Nobody edits code or files to assign anyone: add, remove or promote people in Admin console → Directory → Groups, and the portal picks it up within 15 minutes. Anyone with an islam1.org account gets My Requests and the request modules without a group.

Every portal group is named **`portal-<kind>-<slug>@islam1.org`**. The slug comes from the display name: lowercase it, drop apostrophes, "&" and the word "Committee", and join the words with hyphens ("Women's Committee" → `women`, "Health & Wellness" → `health-wellness`). The group's display name is exactly what the portal shows.

**Team groups: one per committee or team** (`portal-team-<slug>@`). Committees and teams work the same way. In each group:

| Group role | In the portal |
| --- | --- |
| Owner | Chair: approves the committee's requests and sees all of them. Several Owners are co-chairs; any of them can approve |
| Manager | Vice chair: the backup approver when the chair submits a request or is away; sees all of them |
| Member | Member: can request events, marketing and purchases for the committee |

A person can be on any number of teams, with a different role in each. Chairing one never makes them chair of another. The portal finds every `portal-team-*` group by itself, so a new committee is just a new group. Then pick its fund in Portal Settings (step 7).

The launch list (27):

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
| Facility Maintenance | portal-team-facility-maintenance@ | Facilities queue, run sheet |
| Fundraising | portal-team-fundraising@ | |
| Health & Wellness | portal-team-health-wellness@ | |
| IAR Cafe | portal-team-iar-cafe@ | |
| Imam Office | portal-team-imam-office@ | |
| IT Services | portal-team-it-services@ | IT queue and A/V queue |
| Marketing | portal-team-marketing@ | Marketing queue, weekly review |
| Older Adult Community | portal-team-older-adult-community@ | |
| Outreach | portal-team-outreach@ | |
| Page Road | portal-team-page-road@ | |
| Safety & Security | portal-team-safety-security@ | Security queue, run sheet |
| Shura | portal-team-shura@ | Shura dashboard (later) |
| Social & Welfare | portal-team-social-welfare@ | S&W aid and restricted S&W requests |
| Sports & Recreation | portal-team-sports-recreation@ | |
| Volunteer | portal-team-volunteer@ | |
| Women's Committee | portal-team-women@ | |
| Youth | portal-team-youth@ | |

The six teams in the last column switch on modules, so their slugs are the only team names in the code (`QUEUE_ROLES` in `portal/src/lib/teams.ts`). Renaming one of those six means a code change; any other team can be renamed or added freely.

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
| portal-role-finance@ | Finance review, payment, QuickBooks entry, S&W aid; can submit for any fund |
| portal-role-executive@ | Whoever holds an executive office (Head Imam, Shura chair, CEO; one person can hold several): final mission review of events, and executive approvals. When an office changes hands, change the group's members |
| portal-role-admin@ | Every module and Portal Settings, for support. Never approves or pays. Keep to two or three people |
| portal-role-beta@ | During the beta only: with `PORTAL_ACCESS_GROUP` set, only this group and the admins can sign in. Add testers directly, not through nested groups |

**Group settings.** In every team and pillar group, set "Who can manage members" to owners only (or admins only). Otherwise a manager could add people to a committee, which would let them request from its fund.

**If older groups exist** (`portal-office@` and the like, from an earlier setup), rename them in the Admin console rather than making new ones. Google keeps the old address as an alias.

Portal admins can see every module for support, but being an admin never lets anyone approve or pay: those need membership in that group or team itself (`actingRoles` in `portal/src/lib/viewer.ts`). The rules are plain functions with tests in `portal/src/lib/teams.ts`.

### 7. Purchase Requests

1. **Receipts drive.** Create a Shared Drive under islam1.org, for example "PO Records", and add the runtime service account (`$SA`) as a **Content manager**. Make a top-level folder in it for the portal and copy its ID from the URL; that is `PO_DRIVE_FOLDER_ID`. The portal files each request's receipts and invoices as `<year> / PO-12001 · <fund>`. Give finance and the office access through their groups, not individuals. Retention (seven years) is a yearly review by the office, as in the plan.
2. **W-9 drive.** A separate, restricted Shared Drive that only `portal-role-finance@` can open. Add the runtime service account (`$SA`) as a **Contributor** only, so it can add files but not manage the drive. Make a top-level folder for the portal and copy its ID; that is `W9_DRIVE_FOLDER_ID`. When a payment is for labor and the payee has no W-9 on file, the requester must upload one with the request. It is saved there as `W-9 — <payee> — <date>`, and only finance gets a link to it. Finance checks it and ticks "W-9 on file" when approving, which marks the saved vendor so the next request to them needs no W-9. The portal never stores tax ID numbers.
3. **Funds and cards: Portal Settings.** Signed in as a portal admin, open Portal Settings (`/admin`). It lists every team found in Google with its chair, vice chair, director and head count. Pick the fund each team charges; teams whose name matches a fund have it suggested, and the rest show "Needs a fund". Add IAR's cards there too (last four digits, holder, fund). Both are saved in Firestore at `orgs/iar/settings/portal`. There's no file to edit or upload. A team with no fund can't submit purchase requests yet, and a fund no team charges goes straight to finance review.
4. **Executive approval.** Once the Shura sets the dollar amount, set `PO_EXECUTIVE_THRESHOLD` (for example `2500`). Unset means no executive step.
5. The morning digest and overdue reminders aren't built yet. Approvers get an email as soon as a request reaches them once email is set up (next step).

### 8. Email alerts

The portal emails whoever has to act next: an approver when a request reaches them, finance when one reaches its queue, a requester when a request comes back for changes, and the person covering for someone who's away. Everything else appears only under Notifications in the portal. Until this is set up, nothing is emailed and the bell still works.

1. Create a mailbox for the portal to send from, for example `portal@islam1.org` (it needs a Gmail license; a shared mailbox nobody signs in to is fine).
2. Admin console → Security → API controls → Domain-wide delegation: edit the portal's entry from step 4 and add the scope `https://www.googleapis.com/auth/gmail.send` (keep the groups scope; separate them with a comma).
3. Set `PORTAL_MAIL_FROM=portal@islam1.org` when deploying.
4. Let `portal@islam1.org` post to the groups the portal emails (`portal-role-finance@`, `portal-role-executive@`, `portal-role-admin@`, and the team groups with a queue, such as `portal-team-marketing@`): in each group's settings, "Who can post" must include that address or the whole organization.

Be aware: domain-wide delegation applies to the service account, not to one mailbox, so the gmail.send scope would let it send as any islam1.org user. The portal only ever sends as `PORTAL_MAIL_FROM`, the service account has no key file, and only the Cloud Run service runs as it. Keep the project's owners to the two named in "Who owns what".

To try it locally without Google, run `npm run dev`; every email the portal would send is listed at http://localhost:3000/dev.

### 9. Deploy

From the repo root:

```
gcloud run deploy iar-portal --source portal --region us-east1 \
  --service-account $SA --allow-unauthenticated \
  --set-env-vars ORG_DOMAIN=islam1.org,GOOGLE_CLIENT_ID=<client id>,DIRECTORY_ADMIN_SUBJECT=portal-directory@islam1.org,DIRECTORY_SERVICE_ACCOUNT=$SA,NEXTAUTH_URL=https://<portal address>,PO_DRIVE_FOLDER_ID=<folder id>,W9_DRIVE_FOLDER_ID=<W-9 folder id>,PORTAL_MAIL_FROM=portal@islam1.org,PORTAL_ACCESS_GROUP=portal-role-beta@islam1.org \
  --set-secrets GOOGLE_CLIENT_SECRET=google-client-secret:latest,NEXTAUTH_SECRET=nextauth-secret:latest
```

Drop `PORTAL_ACCESS_GROUP` when the beta ends to open the portal to every islam1.org account. `--allow-unauthenticated` lets the sign-in page load; every other page requires an islam1.org Google sign-in inside the app. After the first deploy, set `NEXTAUTH_URL` and the OAuth redirect URI to the service URL (or a custom domain such as portal.islam1.org) and deploy again.

## Who owns what

- Google Cloud project: owned by the islam1.org organization, with at least two project owners.
- Repo: move from the personal GitHub account to an IAR GitHub organization before production.
- Admin role in the portal: the `portal-role-admin` group, not a named person.
