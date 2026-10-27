# IAR Internal Tools Portal

Internal portal for the Islamic Association of Raleigh. Read `README.md`, then `docs/plan.md` (the umbrella plan). It's live at https://portal.islam1.org. To set it up again or change its setup, follow `docs/launch.md`: the `go-live` command in `ops/go-live/` does the setup in `docs/setup.md`, run by an IAR super admin on their own computer.

## Decisions to respect

- **It runs on IAR's own Google Cloud**, in a project under the islam1.org organization: Cloud Run + Firestore. Never deploy it to a personal Google account, Vercel, Firebase Hosting on a personal project, or any other host.
- **It uses IAR's Google Workspace for everything shared**: sign-in (@islam1.org only), Google Groups (who sees what), Google Chat (alerts, from the "IAR Portal" Chat app; Gmail from the portal's own mailbox is only the fallback), Google Calendar and the room resources (room bookings, the source of truth), and Shared Drives (files). No Microsoft services, and no second copy of data that Workspace already holds.
- **This repo is public. No people data in it.** People and roles live in Google Groups: committee and team groups (`portal-team-*`, Owner = chair, Manager = vice chair), director groups (`portal-pillar-*`) and role groups (`portal-role-*`); see `docs/setup.md` §6 and `portal/src/lib/teams.ts`. Which fund each team charges and IAR's cards live in Portal Settings (Firestore). Nobody edits code or files to assign people. `.gitignore` still blocks `roster*.json`. The repo should move to a private IAR-owned GitHub organization.
- **The demo (`demo/index.html`) is retired.** The portal is in use, and the live portal is the design reference. Don't update the demo; it stays as a record of the early design.
- **No key files.** The Cloud Run service account signs its own tokens (`portal/src/lib/google.ts`). Don't create or download service account keys.
- **Owned by IAR, not a person.** Admin access comes from Google Groups (`portal-role-admin@`), and the Cloud project needs at least two owners.
- **Facilities moves into the portal.** The paid facilities team works in Jira today. The goal is to bring them into the portal's IT & Maintenance module, so requesters can follow their requests. Keeping Jira and syncing with it is the fallback only if moving doesn't work out.
- **Budget and Shura dashboard aren't ready for production.** They stay "planned" in the live portal until they're picked up again.
- **Live, except purchase requests.** Everyone at islam1.org uses the portal. Purchase requests stay a demo (a banner, and alerts only for the testers in `portal-role-beta@`) until an admin turns demo mode off in Portal Settings. Only modules marked `live` in `portal/src/lib/modules.ts` are usable. Merging a change to `portal/` deploys it.

## Working in the code

- App: `portal/` (Next.js 16, TypeScript; Mantine for a few form widgets, used only through `src/components/`). `npm run dev` runs it with sample users (switch at `/dev`) and no Google setup. `npm test`, `npm run typecheck` and `npm run build` must pass before pushing.
- Business rules are plain functions with tests (`portal/src/lib/purchases/workflow.ts`, `notices.ts`, `lib/away.ts`, `lib/search.ts`). Pages and server actions call them and never change a request's stage themselves.
- Modules share one template (README, "portal/"): each has a `lib/<module>/module.ts` listed in `lib/registry.ts` and a row in `lib/kinds.ts`; shared pages ask the registry and never check each kind. Server actions go through `lib/card-actions.ts`; request pages use `RequestPage`, `components/Activity.tsx` and `FlashNote`. Shared helpers live in `lib/text.ts`, `lib/dates.ts`, `lib/format.ts`, `lib/workflow-core.ts` and `lib/notices.ts`: use them rather than writing another copy.
- Each store has an in-memory version for dev and a Firestore version for production (`lib/cards.ts`, `lib/notifications.ts`, `lib/people.ts`, `lib/feedback.ts`); Google Calendar has a sample calendar in dev (`lib/calendar.ts`).
- `ops/go-live`: `npm test` and `npm run typecheck` must pass too. It never runs against real Google from a cloud session.
- Write UI text in plain language for volunteers, not technical staff.

## Styling

- The live portal is the reference for layout and look: a new or changed screen follows the screens around it and is built from the same components. Colours, fonts and logos follow IAR's brand guide (`docs/brand.md`); how the pieces fit is in `docs/design-system.md`.
- Every colour, size, corner and shadow is a token in `portal/src/styles/tokens.css` (light and dark). No raw colours and no `style={{ }}` anywhere else: use the components in `portal/src/components/` and a co-located `.module.css`. `src/styles/guard.test.ts` fails the build on either.
- Build module pages from the component library, not new markup: `ItemRow`/`Rows` for any list, `DataTable`, `Choices`/`Checkbox`, `Field`, `Disclosure`, `SearchForm`, `Chips`, `Crumb`, `FileList`, `LinkCard`, `Panel` (+ `PanelNote`/`PanelFoot`). Global classes are only the layout ones in `base.css`; a module's `.module.css` holds only what is truly its own.
- Mantine is used only inside the wrappers in `src/components/` (DateField, RoomPicker, FileDrop, …). Pages never import `@mantine/*`.
- `/dev/styles` (dev mode) shows every token and component in light and dark: check it after a change there.
- Before pushing a UI change, with `npm run dev` running: `npm run a11y` (titles, headings, labels, tap targets, contrast) and `npm run shots` (each screen in light and dark, desktop and phone, in `portal/.shots/report.html`).
