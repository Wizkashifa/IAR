# IAR Internal Tools Portal

Internal portal for the Islamic Association of Raleigh. Read `README.md`, then `docs/plan.md` (the umbrella plan). To stand it up or deploy it, follow `docs/beta-launch.md`, which walks through `docs/setup.md` in order.

## Decisions to respect

- **It runs on IAR's own Google Cloud**, in a project under the islam1.org organization: Cloud Run + Firestore. Never deploy it to a personal Google account, Vercel, Firebase Hosting on a personal project, or any other host.
- **It uses IAR's Google Workspace for everything shared**: sign-in (@islam1.org only), Google Groups (who sees what), Gmail (alert emails, sent as the portal's own mailbox), Google Calendar (room bookings, the source of truth), and Shared Drives (files). No Microsoft services, and no second copy of data that Workspace already holds.
- **No key files.** The Cloud Run service account signs its own tokens (`portal/src/lib/google.ts`). Don't create or download service account keys.
- **Owned by IAR, not a person.** Admin access comes from Google Groups (`portal-admins@`), and the Cloud project needs at least two owners.
- **Facilities moves into the portal.** The paid facilities team works in Jira today. The goal is to bring them into the portal's IT & Maintenance module, so requesters can follow their requests. Keeping Jira and syncing with it is the fallback only if moving doesn't work out.
- **Budget and Shura dashboard aren't ready for production.** They stay "planned" in the live portal and are still being designed in the demo (`demo/index.html`).
- **Beta first.** A small group tests the portal before production. Only modules marked `live` in `portal/src/lib/modules.ts` are usable.

## Working in the code

- App: `portal/` (Next.js 15, TypeScript). `npm run dev` runs it with sample users (switch at `/dev`) and no Google setup. `npm test`, `npm run typecheck` and `npm run build` must pass before pushing.
- Business rules are plain functions with tests (`portal/src/lib/purchases/workflow.ts`, `notices.ts`, `lib/away.ts`, `lib/search.ts`). Pages and server actions call them and never change a request's stage themselves.
- Each store has an in-memory version for dev and a Firestore version for production (`lib/cards.ts`, `lib/notifications.ts`, `lib/people.ts`, `lib/feedback.ts`).
- Write UI text in plain language for volunteers, not technical staff.
