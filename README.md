# IAR Internal Tools Portal

One internal portal for the Islamic Association of Raleigh, signed into with an @islam1.org Google account. It replaces the Requisition Form (Google Forms + Form Approvals), the Program Request Form (Microsoft Forms) and the Marketing/AV Request Form with request cards that move through clear stages, owned by the requester and worked by each team from its own queue. Google Groups decide which modules each person sees.

Modules: **My Requests**, **Purchase Requests** (payments, reimbursements, card receipts, and the Finance desk), **Events & Rooms** (room holds on IAR's room calendars, policy rules flagged automatically, asking for a booked time) with the **Calendar** and **Find a room**, **Marketing Requests** (with file uploads, and Team work for the marketing team), the **daily run sheet**, **event close-out**, **IT & Maintenance** (bringing facilities off Jira, with A/V tickets for events and My work today on their phones), **Who's who**, the **Library** (IAR's policies), **What's stuck**, and in-portal **Help**. Alerts go to whoever acts next through Google Chat, with each person's notification choices. Later: gym rentals, the rest of the Library, Budget and the Shura dashboard. Social & Welfare aid goes through Purchase Requests, restricted to S&W, finance and the executives.

**Status: live at https://portal.islam1.org.** Merging a change to `portal/` deploys it. Locally, `npm run dev` runs it with sample data. One command, `go-live` (`ops/go-live/`), sets up IAR's Google Workspace and Cloud, after showing every change; see [docs/launch.md](docs/launch.md).

## Start here

- **[docs/plan.md](docs/plan.md)** — the umbrella portal plan: problems, decisions, the event card lifecycle, modules, policy automation, architecture, roadmap, open questions. Live editable copy: [Claude doc](https://claude.ai/code/artifact/3c8494a5-1c2d-4c94-a234-fb35f36e1630).
- **[demo/index.html](demo/index.html)** — the clickable demo used to design the portal (sample data, nothing saved). Retired: the live portal is now the design reference, and the demo isn't updated.
- **[portal/](portal/)** — the portal app (Next.js on Cloud Run, Firestore). Run it locally with `cd portal && npm install && npm run dev`, no Google setup needed; switch sample users at `/dev`, where the Chat messages the portal would send and a "run the daily job" button also are. `npm test` runs every module's rules.
  - Each module keeps its rules in `portal/src/lib/<module>/` and its pages in `portal/src/app/<module>/`: `purchases`, `events`, `marketing`, `tickets` (pages under `app/it-maintenance`). Every request is a card (`lib/cards.ts`) of type `purchase`, `event`, `marketing` or `ticket`, with its module's fields under `card.purchase`, `card.event` and so on.
  - Every module follows the same template. In `lib/<module>/`: `types.ts` and `workflow.ts` (its stages and who may do what), `notices.ts` (who hears what), `access.ts`, `daily.ts`, `samples.ts`, and `module.ts`, which hands the shared pages its step bar, "What happens next", "needs you" rule and who it waits on. `lib/registry.ts` lists the modules and `lib/kinds.ts` names them; shared pages ask those instead of checking each kind. In `app/<module>/`: a list page, a request page built on `RequestPage` with the shared comments and history (`components/Activity.tsx`), a form using `FormErrors`, and `actions.ts`, which gives `lib/card-actions.ts` only its own switch over the workflow's actions. A new kind of request is a new module plus one line in each of `registry.ts` and `kinds.ts`.
  - Shared: Google Chat alerts (`lib/alerts.ts`, `lib/chat.ts`), room calendars (`lib/calendar.ts`, `lib/rooms-google.ts`), the daily job (`lib/daily.ts`, `app/api/daily`), who can open what (`lib/access.ts`).
- **[ops/go-live/](ops/go-live/)** — the setup command and the blank members template (`members-template.xlsx`, no people in it).
- **[docs/launch.md](docs/launch.md)** — launching and running the portal: what to collect, running go-live, the Shared Drives and Portal Settings to set, the smoke test, the weekly check, and turning it off.
- **[docs/setup.md](docs/setup.md)** — every setup step by hand, as a reference and fallback.

## Picking this up in a new chat

Point Claude at this repo (`wizkashifa/iar`) and ask it to read `docs/plan.md`. The Claude docs linked above are the live, editable copies and may be ahead of what's exported here. Re-export with the Claude Docs `export` action (format `markdown`) after editing them, so this repo stays in sync.

## Ownership note

This system is meant to be owned by IAR as an organization, not by any one person's Google or Microsoft account. This repo is a stopgap under a personal GitHub account; move it to an IAR-owned GitHub org before going into production.
