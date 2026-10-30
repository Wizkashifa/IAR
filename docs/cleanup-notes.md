# Clean-up notes: repeated code

CLAUDE.md asks for shared helpers ("use them rather than writing another copy"). These are places where code still repeats something that exists already, for a later clean-up.

## Done (Oct 30, 2026)

Everything on the first list is done. What people see stayed the same, except for the three small fixes at the end of this section.

- **Event forms.** `ChecksPanel`, `ClashText` and `DayPanel` in `app/events/ui.tsx` draw the Checks panel and the calendar panel for both `EventForm` and `TimeForm`.
- **One submit button.** `components/SubmitButton.tsx` replaces the 8 `Submit` copies in the event, purchase, statement, marketing, ticket and import forms.
- **`actOnCardForm`** (`lib/card-actions.ts`) is `actOnCard` for a form that keeps what was typed. `rescheduleEvent` uses it, so the stale-page check, save, follow-up, notices and revalidate are written once. A failure sending alerts after a time change is now logged instead of showing an error page.
- **Smaller event helpers:**
  - `clashesNow` re-checks the calendar for both `approve` and `approve_change`.
  - `closeChange` in `lib/events/reschedule.ts` does approve, decline and withdraw a change.
  - `readEdit` takes a plain object, so `checkTime` doesn't build a `FormData`.
- **Notices.** `collector` in `lib/notices.ts` now takes `delegable`. `eventNotices` and `rescheduleNotices` both use it.
- **"What happens next" for an ask the IAR office answers** comes from `lib/events/module.ts`, through `StepOptions.officeAnswers`. `nextReview0` is now `firstReview`.
- **Time helpers.** The time ↔ minutes copies now use `toMinutes` and `holdWindow`.
- **Date and text helpers:**
  - `slot-requests.ts` uses `dayText` and `timeText`.
  - Local date formatters use `dayText`, `longDate` and `fmtShortDay`: card-row, home, away, measures, marketing, ticket schedules and library.
  - Day maths uses `addDays`, `addMonths` and `daysBetween`: EventForm, RoomDay, library and ticket schedules.
  - `todayLocal` replaces a copy in RequestExamples.
  - `fileSize` replaces a copy in FileDrop.
  - `andList(…, "or")` builds the quick-fix sentence.
  - `plural` covers 5 counts.
  - `lc` covers 13 places that trimmed and lower-cased.
  - One exported `nowIso` (`lib/dates.ts`) replaces 6 copies.

Changes people might notice:

- An ask's dates read "Tue, Nov 17", like the rest of the request page. Before, they read "Tue Nov 17".
- On the change-time form, a clash row puts the booking's name and the rest of the sentence on one line, as on the request form.
- A ticket schedule with an impossible next date ("2026-13-01") shows "Choose the next date." instead of failing.

How it was checked:

- `npm test` (3 new tests), typecheck, build and `npm run a11y` all pass.
- `npm run shots` was compared pixel by pixel with the screens before the change. The only differences were the date comma above, sub-pixel text rendering, and captures taken while the page was still loading.
- A Playwright run of the event flows gave the same results on the old and new code:
  - a clash and asking for the time;
  - a quick fix;
  - off-site;
  - asking to change an approved event's time;
  - an ask the office answers.

## Still to do

Each of these was left alone on purpose, because the change wouldn't be exactly the same for everyone.

- **Same-address checks.** These places compare `a.toLowerCase() === b.toLowerCase()` where `lib/text.ts` has `same()`:
  - `lib/access.ts`
  - `lib/events/access.ts`
  - `lib/events/renewal.ts`
  - `lib/again.ts`
  - `lib/cards.ts`
  - `lib/act-as.ts`
  - `lib/teams.ts`
  - `lib/purchases/input.ts`
  - `lib/purchases/reminders.ts`
  - `lib/purchases/settings.ts`
  - `lib/names.ts`
  - `lib/feedback-thread.ts`
  - `lib/comments.ts`
  - the marketing and purchase request and edit pages
  - `app/purchases/page.tsx`
  - `app/events/ops-ui.tsx`

  `same()` also trims spaces, and two empty values never match, so check each place before switching.
- **Notice builders.** `marketingNotices` and `purchaseNotices` have their own `add`. `collector` would also stop a person getting two notices about one change; decide whether that's wanted first.
- **Close-out.** `closeOutEvent` (`app/events/ops-actions.ts`) saves the card without `actOnCard`. Moving it changes three things: who may act (the `mayOpen` check), the message when alerts fail, and where the page lands (`#closeout`).
- **"Waiting on" for an ask the office answers.** This is still set on the request page, because `waitingOn` is stored on the card. Saying it in the workflow would change how the lists read too.
- **Small repeats with no shared helper yet:**
  - About 30 inline ``error=${encodeURIComponent(…)}`` redirects in the app's actions.
  - `pad` in `lib/purchases/statement.ts` and `statement-sample.ts`.
  - The title-case code in `lib/name-cache.ts` and `fallbackName` in `lib/steps.ts`. They don't do the same job: `prettifyEmail` also drops group prefixes and numbers.
  - The `PORTAL_ACCESS_GROUP` lower-casing in `lib/org.ts` and `lib/groups.ts`.

## How to look for more

- Search for small local helpers that redo shared ones:
  - `toMin`, `fm`, `fmtDate`, `fmtTime`, `padStart(2, "0")`
  - `toLocaleDateString(` with `T12:00:00Z`
  - `.trim().toLowerCase()`
  - `const add = (to`
  - `function Submit`

  Compare each with `lib/text.ts`, `lib/dates.ts`, `lib/format.ts`, `lib/events/series.ts` and `lib/notices.ts`.
- Look for pages that build "What happens next" or "Waiting on" text themselves instead of asking `lib/registry.ts`.
- Look for server actions that save a card without going through `lib/card-actions.ts`.
