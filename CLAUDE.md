# IAR Internal Tools Portal

Internal portal for the Islamic Association of Raleigh. Read `README.md`, then `docs/plan.md` (the umbrella plan). To stand it up or deploy it, follow `docs/beta-launch.md`: the `go-live` command in `ops/go-live/` does the setup in `docs/setup.md`, run by an IAR super admin on their own computer.

## Decisions to respect

- **It runs on IAR's own Google Cloud**, in a project under the islam1.org organization: Cloud Run + Firestore. Never deploy it to a personal Google account, Vercel, Firebase Hosting on a personal project, or any other host.
- **It uses IAR's Google Workspace for everything shared**: sign-in (@islam1.org only), Google Groups (who sees what), Google Chat (alerts, from the "IAR Portal" Chat app; Gmail from the portal's own mailbox is only the fallback), Google Calendar and the room resources (room bookings, the source of truth), and Shared Drives (files). No Microsoft services, and no second copy of data that Workspace already holds.
- **This repo is public. No people data in it.** People and roles live in Google Groups: committee and team groups (`portal-team-*`, Owner = chair, Manager = vice chair), director groups (`portal-pillar-*`) and role groups (`portal-role-*`); see `docs/setup.md` §6 and `portal/src/lib/teams.ts`. Which fund each team charges and IAR's cards live in Portal Settings (Firestore). Nobody edits code or files to assign people. `.gitignore` still blocks `roster*.json`. The repo should move to a private IAR-owned GitHub organization.
- **The demo (`demo/index.html`) uses role labels for people** ("Youth Chair", "Maintenance Staff"). The published demo link shows real names, swapped in at publish time from a mapping kept outside the repo. Write any new guide text with `fn("id")`, not a typed name.
- **No key files.** The Cloud Run service account signs its own tokens (`portal/src/lib/google.ts`). Don't create or download service account keys.
- **Owned by IAR, not a person.** Admin access comes from Google Groups (`portal-role-admin@`), and the Cloud project needs at least two owners.
- **Facilities moves into the portal.** The paid facilities team works in Jira today. The goal is to bring them into the portal's IT & Maintenance module, so requesters can follow their requests. Keeping Jira and syncing with it is the fallback only if moving doesn't work out.
- **Budget and Shura dashboard aren't ready for production.** They stay "planned" in the live portal and are still being designed in the demo (`demo/index.html`).
- **Beta first.** A small group tests the portal before production. Only modules marked `live` in `portal/src/lib/modules.ts` are usable.

## Working in the code

- App: `portal/` (Next.js 16, TypeScript; Mantine for a few form widgets, used only through `src/components/`). `npm run dev` runs it with sample users (switch at `/dev`) and no Google setup. `npm test`, `npm run typecheck` and `npm run build` must pass before pushing.
- Business rules are plain functions with tests (`portal/src/lib/purchases/workflow.ts`, `notices.ts`, `lib/away.ts`, `lib/search.ts`). Pages and server actions call them and never change a request's stage themselves.
- Each store has an in-memory version for dev and a Firestore version for production (`lib/cards.ts`, `lib/notifications.ts`, `lib/people.ts`, `lib/feedback.ts`); Google Calendar has a sample calendar in dev (`lib/calendar.ts`).
- `ops/go-live`: `npm test` and `npm run typecheck` must pass too. It never runs against real Google from a cloud session.
- Write UI text in plain language for volunteers, not technical staff.

## Styling

- The demo (`demo/index.html`) is the reference for layout and look. If a screen needs to look different, change the demo first. Colours, fonts and logos follow IAR's brand guide (`docs/brand.md`); how the pieces fit is in `docs/design-system.md`.
- Every colour, size, corner and shadow is a token in `portal/src/styles/tokens.css` (light and dark). No raw colours and no `style={{ }}` anywhere else: use the components in `portal/src/components/` and a co-located `.module.css`. `src/styles/guard.test.ts` fails the build on either.
- Mantine is used only inside the wrappers in `src/components/` (DateField, RoomPicker, FileDrop, …). Pages never import `@mantine/*`.
- `/dev/styles` (dev mode) shows every token and component in light and dark: check it after a change there.
- Before pushing a UI change, with `npm run dev` running: `npm run a11y` (titles, headings, labels, tap targets, contrast) and `npm run shots` (each screen next to the demo, in `portal/.shots/report.html`).
