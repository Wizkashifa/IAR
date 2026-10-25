# IAR Internal Tools Portal

One internal portal for the Islamic Association of Raleigh, signed into with an @islam1.org Google account. It replaces the Requisition Form (Google Forms + Form Approvals), the Program Request Form (Microsoft Forms) and the Marketing/AV Request Form with request cards that move through clear stages, owned by the requester and worked by each team from its own queue. Google Groups decide which modules each person sees.

Beta modules: **My Requests**, **Purchase Requests** (payments, reimbursements, card receipts, and the Finance desk), **Events & Rooms** (room holds on IAR's room calendars, policy rules flagged automatically, asking for a booked time) with the **Calendar** and **Find a room**, **Marketing Requests** (with file uploads), **Team Queues**, the **daily run sheet**, **event close-out**, **IT & Maintenance** (bringing facilities off Jira, with My work today on their phones), **Who's who**, the **Library** (IAR's policies), **What's stuck**, and in-portal **Help**. Alerts go to whoever acts next through Google Chat, with each person's notification choices. Later: gym rentals, the rest of the Library, Budget and the Shura dashboard. Social & Welfare aid goes through Purchase Requests, restricted to S&W and finance.

**Status: ready for the beta, not yet deployed.** Everything runs locally with sample data. One command, `go-live` (`ops/go-live/`), sets up IAR's Google Workspace and Cloud and deploys it, after showing every change; see [docs/beta-launch.md](docs/beta-launch.md).

## Start here

- **[docs/plan.md](docs/plan.md)** — the umbrella portal plan: problems, decisions, the event card lifecycle, modules, policy automation, architecture, roadmap, open questions. Live editable copy: [Claude doc](https://claude.ai/code/artifact/3c8494a5-1c2d-4c94-a234-fb35f36e1630).
- **[demo/index.html](demo/index.html)** — clickable demo of the whole portal with a role switcher and a built-in walkthrough (sample data, nothing saved). Live at https://claude.ai/artifact/Scx6GtWsFGedmz2RQzKJZK.
- **[portal/](portal/)** — the portal app (Next.js on Cloud Run, Firestore). Run it locally with `cd portal && npm install && npm run dev`, no Google setup needed; switch sample users at `/dev`, where the Chat messages the portal would send and a "run the daily job" button also are. `npm test` runs every module's rules.
  - Each module keeps its rules in `portal/src/lib/<module>/` and its pages in `portal/src/app/<module>/`: `purchases`, `events`, `marketing`, `tickets` (pages under `app/it-maintenance`). Every request is a card (`lib/cards.ts`) of type `purchase`, `event`, `marketing` or `ticket`, with its module's fields under `card.purchase`, `card.event` and so on.
  - Shared: Google Chat alerts (`lib/alerts.ts`, `lib/chat.ts`), room calendars (`lib/calendar.ts`, `lib/rooms-google.ts`), the daily job (`lib/daily.ts`, `app/api/daily`), who can open what (`lib/access.ts`).
- **[ops/go-live/](ops/go-live/)** — the setup command and the blank members template (`members-template.xlsx`, no people in it).
- **[docs/beta-launch.md](docs/beta-launch.md)** — the beta runbook: what to collect, running go-live, the Shared Drives and Portal Settings to set, the smoke test, and what to do during the beta.
- **[docs/setup.md](docs/setup.md)** — every setup step by hand, as a reference and fallback.
- **[app/index.html](app/index.html)** — the original clickable Purchase Requests prototype (sample data only, nothing saved), now superseded by the module in `portal/`. Live at https://claude.ai/artifact/RBKN5GrTWCqvFfDTqq5RzB.

## Picking this up in a new chat

Point Claude at this repo (`wizkashifa/iar`) and ask it to read `docs/plan.md`. The Claude docs linked above are the live, editable copies and may be ahead of what's exported here. Re-export with the Claude Docs `export` action (format `markdown`) after editing them, so this repo stays in sync.

## Ownership note

This system is meant to be owned by IAR as an organization, not by any one person's Google or Microsoft account. This repo is a stopgap under a personal GitHub account; move it to an IAR-owned GitHub org before going into production.
