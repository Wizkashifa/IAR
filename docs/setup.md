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
2. Enable these APIs: Cloud Run, Cloud Build, Artifact Registry, Firestore, Secret Manager, IAM Service Account Credentials, Admin SDK, Drive (for Purchase Requests receipts).

```
gcloud config set project iar-portal
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com admin.googleapis.com \
  drive.googleapis.com
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

The portal reads which Google Groups a person is in, read-only.

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

### 6. Access groups

Create these Google Groups in the Admin console. Membership decides what each person sees; anyone with an islam1.org account gets My Requests, Purchase Requests and Events without a group.

| Group | Unlocks |
| --- | --- |
| portal-committee-chairs@ | Chair approvals |
| portal-office@ | Event review, team queues, run sheet, rentals |
| portal-finance@ | Finance review, S&W aid (with S&W) |
| portal-cardholders@ | Marks IAR cardholders. Who can submit receipts for which card comes from the card list in Purchase Requests settings |
| portal-marketing@, portal-av@, portal-facilities@, portal-security@ | That team's queue; facilities and security also see the run sheet |
| portal-sw@ | Social & Welfare aid |
| portal-executive@ | Executive approvals |
| portal-shura@ | Shura / board: dashboard and budget (read-only) and requests to finance and the executive. Never approves or pays |
| portal-admins@ | Everything, plus portal settings. Keep to two or three people |

Group-to-role mapping lives in `portal/src/lib/org.ts`. Portal admins can see every module for support, but being an admin never lets anyone approve or pay: those need membership in that group itself (`actingRoles` in `portal/src/lib/viewer.ts`).

### 7. Purchase Requests

1. **Receipts drive.** Create a Shared Drive under islam1.org, for example "PO Records", and add the runtime service account (`$SA`) as a **Content manager**. Make a top-level folder in it for the portal and copy its ID from the URL; that is `PO_DRIVE_FOLDER_ID`. The portal files each request's receipts and invoices as `<year> / PO-12001 · <fund>`. Give finance and the office access through their groups, not individuals. Retention (seven years) is a yearly review by the office, as in the plan.
2. **W-9 drive.** A separate, restricted Shared Drive that only `portal-finance@` can open. Do **not** add the service account. The portal never stores W-9s or tax IDs; finance confirms "W-9 on file" in the app after saving the form there.
3. **Approvers and cards.** Fill in `FUND_APPROVERS` (each fund's chair and a backup) and `CREDIT_CARDS` (last four digits, cardholder, fund — never the full number) in `portal/src/lib/purchases/settings.ts`, from the office's confirmed lists. Until then every request goes straight to finance review and nobody can submit card receipts. These move to Portal Settings later.
4. **Executive approval.** Once the Shura sets the dollar amount, set `PO_EXECUTIVE_THRESHOLD` (for example `2500`). Unset means no executive step.
5. The morning digest and overdue reminders aren't built yet. Approvers get an email as soon as a request reaches them once email is set up (next step).

### 8. Email alerts

The portal emails whoever has to act next: an approver when a request reaches them, finance when one reaches its queue, a requester when a request comes back for changes, and the person covering for someone who's away. Everything else appears only under Notifications in the portal. Until this is set up, nothing is emailed and the bell still works.

1. Create a mailbox for the portal to send from, for example `portal@islam1.org` (it needs a Gmail license; a shared mailbox nobody signs in to is fine).
2. Admin console → Security → API controls → Domain-wide delegation: edit the portal's entry from step 4 and add the scope `https://www.googleapis.com/auth/gmail.send` (keep the groups scope; separate them with a comma).
3. Set `PORTAL_MAIL_FROM=portal@islam1.org` when deploying.
4. Let `portal@islam1.org` post to the groups the portal emails (`portal-finance@`, `portal-executive@`, `portal-admins@`): in each group's settings, "Who can post" must include that address or the whole organization.

Be aware: domain-wide delegation applies to the service account, not to one mailbox, so the gmail.send scope would let it send as any islam1.org user. The portal only ever sends as `PORTAL_MAIL_FROM`, the service account has no key file, and only the Cloud Run service runs as it. Keep the project's owners to the two named in "Who owns what".

To try it locally without Google, run `npm run dev`; every email the portal would send is listed at http://localhost:3000/dev.

### 9. Deploy

From the repo root:

```
gcloud run deploy iar-portal --source portal --region us-east1 \
  --service-account $SA --allow-unauthenticated \
  --set-env-vars ORG_DOMAIN=islam1.org,GOOGLE_CLIENT_ID=<client id>,DIRECTORY_ADMIN_SUBJECT=portal-directory@islam1.org,DIRECTORY_SERVICE_ACCOUNT=$SA,NEXTAUTH_URL=https://<portal address>,PO_DRIVE_FOLDER_ID=<folder id>,PORTAL_MAIL_FROM=portal@islam1.org \
  --set-secrets GOOGLE_CLIENT_SECRET=google-client-secret:latest,NEXTAUTH_SECRET=nextauth-secret:latest
```

`--allow-unauthenticated` lets the sign-in page load; every other page requires an islam1.org Google sign-in inside the app. After the first deploy, set `NEXTAUTH_URL` and the OAuth redirect URI to the service URL (or a custom domain such as portal.islam1.org) and deploy again.

## Who owns what

- Google Cloud project: owned by the islam1.org organization, with at least two project owners.
- Repo: move from the personal GitHub account to an IAR GitHub organization before production.
- Admin role in the portal: the `portal-admins` group, not a named person.
