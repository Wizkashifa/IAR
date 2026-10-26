# go-live

One command that sets up IAR's Google Workspace and Google Cloud for the IAR Portal, and deploys it. It does, in order, every step in `docs/setup.md` (§1–§9) and `docs/beta-launch.md`.

**By default it changes nothing.** It lists every change it would make, step by step, in plain language. Add `--apply` and it shows the same list for each step and asks **Apply? (y/N)** before doing it. Anything that costs money, may email people, widens access or removes something gets its own separate yes.

It's safe to run again at any time. Each step checks what already exists and skips it, so a second run after a finished setup lists no changes.

## Never use a personal account

Everything goes into IAR's Google organization (islam1.org): IAR's Cloud project, IAR's Workspace, IAR's billing account. Sign in to gcloud and to the browser with **your @islam1.org super admin account**, never a personal Gmail. go-live checks this and stops if it isn't.

go-live never creates or downloads a service account key (the portal signs its own tokens), and never sends an email: the one email it writes, to IAR's DNS manager, is saved as a draft in your Gmail for you to read and send.

## What you need

- A computer (Mac or Windows) with **Node 20 or later** and the **gcloud CLI** ([install](https://cloud.google.com/sdk/docs/install)), plus its beta commands: `gcloud components install beta` (if gcloud came from a package manager, install its "beta" package instead).
- Your **@islam1.org Workspace super admin** account, which can also create Cloud projects in the islam1.org organization and use IAR's billing account.
- gcloud signed in as that account: `gcloud auth login you@islam1.org`
- This repository on the computer, and once: `npm --prefix ops/go-live install`

## The commands

Run these from the top folder of the repository.

```
npm --prefix ops/go-live start                                   # show every change, change nothing
npm --prefix ops/go-live start -- --apply                        # make them, asking before each step
npm --prefix ops/go-live start -- --template --apply             # make the blank members Sheet, then stop
npm --prefix ops/go-live start -- --sheet <Sheet link> --apply   # use the filled-in Sheet (remembered afterwards)
```

Other options:

| Option | What it does |
| --- | --- |
| `--only <step>` | Run one step (plus sign-in, and reading the Sheet if the step needs it). Steps: `preflight`, `sheet`, `cloud`, `accounts`, `delegation`, `groups`, `chat`, `drives`, `rooms`, `deploy`, `settings`, `safety`, `check`, `beta` |
| `--sync` | Also list people in the portal groups who aren't on the Sheet, and remove them after a separate yes. Without it, go-live only adds |
| `--redeploy` | Rebuild and deploy the current portal code |
| `--only autodeploy` | Extra step, not part of a full run: deploy the portal automatically each time a change is merged (see "Deploying changes" below) |
| `--production` | End the beta: open the portal to every islam1.org account (asks first) |
| `--project <id>` | Cloud project (default `iar-portal`) |
| `--region <region>` | Cloud region (default `us-east1`, closest to Raleigh) |
| `--domain <domain>` | Workspace domain (default `islam1.org`) |
| `--client <file>` | go-live's sign-in client file, if it isn't `ops/go-live/client_secret*.json` |

## The steps

0. **Check this computer and sign in.** Node and gcloud are there and signed in as an islam1.org account; the Cloud project exists under the organization (created if not); go-live's own sign-in client exists (if not, you make it by hand, see below). Then your browser opens to sign you in, and go-live checks you're a super admin.
1. **The members Sheet.** `--template` makes the blank Sheet in your Drive (no people in it) and stops. Otherwise go-live reads the filled-in Sheet and checks every address is a real account. **If anything is wrong it stops and lists every problem**, before changing anything.
2. **Google Cloud.** Links billing (*asked*), turns on the APIs, creates Firestore with its indexes and point-in-time recovery, the portal's two service accounts with only the roles they need, and the two secrets (you paste the Web client's secret once; it isn't shown).
3. **Workspace accounts.** `portal@` (the portal's mailbox) and `portal-directory@` (can only read groups and rooms), with random passwords nobody sees. A license for `portal@` (*asked*). A read-only admin role, "Portal reader", for `portal-directory@`.
4. **Domain-wide delegation** (*by hand, asked*). go-live prints the exact Client ID and scopes to paste, then tests every scope itself.
5. **Google Groups.** Every committee, pillar and role group, with its settings and the people from the Sheet. Testers are never added here.
6. **Google Chat** (*partly by hand*). The "IAR Portal" Chat app, then one Chat space per team with its group and the app in it.
7. **Shared Drives** for receipts, W-9s (finance only), maintenance photos and marketing files.
8. **Room calendars.** Lists IAR's room resources in Google (it never creates rooms) and asks once which ones people can't book; the Sheet's Rooms tab can also say Yes or No for a room. Shares each bookable room's calendar, and the main events calendar if IAR has one (press Enter to skip), with `portal@`.
9. **Deploy.** Builds and deploys the portal to Cloud Run with all its settings, has you add its sign-in address to the Web client (*by hand, checked*), and maps `portal.islam1.org`: go-live writes a **Gmail draft** to IAR's DNS manager with the exact records. On later runs it checks DNS and the certificate, and switches the portal to `portal.islam1.org` once both work.
10. **Portal Settings.** Writes the Sheet's team funds and cards, the Chat spaces and the bookable rooms from step 8 into Portal Settings. Only fills gaps: anything an admin already chose is kept. Then archives the Sheet: from then on, **Google Groups is the record** of who does what.
11. **Running costs and safety.** The daily job, a nightly Firestore backup kept 30 days, an uptime check that emails the admins, a $25/month budget alert (*asked*), and a cleanup rule keeping the last 10 builds.
12. **Check.** The sign-in page answers, and the smoke test from `docs/beta-launch.md` to do with testers.
13. **Go live (beta).** Adds the Sheet's testers to `portal-role-beta@` (*asked*, since Google may email them). With `--production`, opens the portal to everyone instead (*asked*).

## What's done by hand, and why

Google has no API for these, so go-live prints the exact steps (with the console link), waits for you to press Enter, and then checks it worked where it can:

- **Step 0: the OAuth consent screen and two sign-in clients.** In the Cloud console: consent screen *Internal*, app name "IAR Portal"; a **Web application** client for the portal (go-live asks for its Client ID); a **Desktop app** client for go-live, whose JSON you save as `ops/go-live/client_secret.json` (it's gitignored). Checked: the file is a Desktop client from this project, and the Client ID belongs to this project.
- **Step 4: the domain-wide delegation entry**, in the Admin console. Checked: for a minute you get permission to sign test tokens as the portal's service account, go-live gets a token for each scope exactly as the portal will, and the permission is removed again.
- **Step 6: the Chat app configuration, its private Marketplace listing, and installing it for the beta group.** Checked: go-live adds the app to the Chat spaces, which fails if it isn't set up and visible to you.
- **Step 9: the redirect URI** on the Web client (once for the Cloud Run address, again for portal.islam1.org). Checked: Google accepts the address for that client.
- **Extra step autodeploy: installing the Cloud Build app on GitHub**, on the portal's repository only. Checked: Cloud Build reports the GitHub link as complete.
- **Step 9: proving IAR manages islam1.org** to Google, if gcloud doesn't already show it as verified: `gcloud domains verify islam1.org`.

## Deploying changes

Once the portal is running, set it to deploy itself whenever a change is merged:

```
npm --prefix ops/go-live start -- --only autodeploy            # show what it would do
npm --prefix ops/go-live start -- --only autodeploy --apply    # do it, asking before each change
```

It creates `portal-deployer@`, a service account that can only push the portal's image and give the running service a new revision; links Cloud Build to GitHub (you install the Cloud Build app on the portal's repository, *by hand*, once); and adds the trigger `portal-deploy-on-merge`. From then on, each change to `portal/` merged into `main` runs `portal/cloudbuild.yaml`: the tests and typecheck and the image build run side by side, then it deploys, in about 5 minutes (unchanged parts of the build are reused). If a test fails, nothing is deployed and the running portal stays as it was. Changes to the docs or to go-live don't redeploy. The service keeps its settings and secrets, which go-live still manages. Watch the builds in the Cloud console under Cloud Build → History.

If the repository moves (to IAR's own GitHub organization), delete the trigger and the `iar-portal` repository link in Cloud Build, install the Cloud Build app on the new repository, remove `autodeployRepo` from `.state.json`, and run `--only autodeploy --apply` again.

Without it, deploy by hand from the repo root, on the code you want live: `gcloud run deploy iar-portal --source portal --region us-east1 --project iar-portal` (keeps the service's settings), or `--only deploy --redeploy --apply`.

## Running it again

Run the same command again whenever you like: after fixing a problem it stopped on, after a step done by hand, to check DNS for `portal.islam1.org`, or just to see that everything is still in place. It picks up where it left off.

go-live remembers what it made in `ops/go-live/.state.json`: project and resource IDs, never people. The one exception is the DNS manager's email address, kept so the draft can be written again if needed. The file is gitignored; keep it on this computer. If it's lost, go-live finds most things again by name and asks for the rest.

After step 10, the Sheet is archived and **nobody is added from it again**: add, remove or promote people in Admin console → Directory → Groups.

## If something goes wrong

- go-live stops with a plain message saying what's wrong and what to do; everything done before it is kept.
- **"allUsers" isn't allowed** when deploying: IAR's organization limits sharing to islam1.org (the "Domain restricted sharing" policy), which blocks `--allow-unauthenticated`. The sign-in page has to load for people who aren't signed in yet, so an organization admin must allow it for this project only (Cloud console → IAM & Admin → Organization policies → "Domain restricted sharing" → override for the project). The portal itself still only lets islam1.org accounts in.
- **No free license for portal@**: go-live says how to get one and carries on; email alerts wait until it has one. Run it again afterwards.
- Logs from the running portal: `gcloud run services logs read iar-portal --region us-east1`

## For developers

```
npm --prefix ops/go-live test          # every stage against an in-memory Google (src/google-fake.ts)
npm --prefix ops/go-live run typecheck
npm --prefix ops/go-live run template:xlsx   # rewrites members-template.xlsx
```

The stages are in `src/stages/`, one file each: `plan` only reads and returns the changes; each change carries what applying it does. `src/google.ts` is every call go-live makes; `src/google-real.ts` makes them (Workspace APIs with your sign-in, Cloud through gcloud), and `src/google-fake.ts` is the in-memory Google the tests use. The tests never talk to Google.
