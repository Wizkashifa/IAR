# Clean-up notes: repeated code

CLAUDE.md asks for shared helpers ("use them rather than writing another copy"). These are places where code repeats something that already exists, for a later clean-up. Nothing here changes what people see.

## From the event request changes (change date or time, office answers, quick fixes)

Most of these came from building each new piece next to the old one, so the existing screens couldn't break, and then never merging them.

| Copy | Why it happened | Fix |
|---|---|---|
| The Checks panel, calendar panel and `Submit` button in `portal/src/app/events/TimeForm.tsx` repeat those in `EventForm.tsx`. | The request form has these panels written inline, and I avoided touching the form every new request goes through. | Pull out `ChecksPanel`, `DayPanel` and `Submit` into `app/events/ui.tsx` and use them in both. Check with `npm run shots`. |
| `rescheduleEvent` in `app/events/actions.ts` repeats `actOnCard`'s steps: stale-page check, save, follow-up, notices, revalidate and redirect. | The time form needs errors to stay on the form (`FormState`), and `actOnCard` always redirects. | Give `actOnCard` an option to return errors instead of redirecting, and use it for both. |
| `approve_change` re-checks the calendar in its own code, next to `approve`'s re-check (`actions.ts`). | Its input is the new time. | One helper: the clashes a given time would have now. |
| `approveChange`, `declineChange` and `withdrawChange` in `lib/events/reschedule.ts` each drop `change`, add history and call `withStage`. | Written one at a time. | One private helper. |
| `rescheduleNotices` in `lib/events/notices.ts` copies `eventNotices`' `add` helper, which skips the actor. | It also skips duplicates. | One shared helper with the duplicate check, used by both. |
| `checkTime` in `actions.ts` builds a `FormData` only to reuse `readEdit`. | Quickest way to reuse the checks. | `readEdit` should take a plain object; the form version calls it. |
| `app/events/[id]/page.tsx` writes its own "What happens next" and "Waiting on" text when the IAR office answers an ask. | `eventModule.next` doesn't know about asks. | Pass the waiting ask through `StepOptions` so `lib/events/module.ts` says it, as the registry rule expects. Also rename `nextReview0`. |

## Already there before

- The time ↔ minutes helpers are written out again in `app/events/actions.ts` (`toMin`, `fm`), `app/events/[id]/page.tsx` (`holdTimes`) and `app/events/ui.tsx` (`toMin`). Use `toMinutes` and `fromMinutes` in `lib/events/series.ts`, and `holdWindow` in `lib/calendar.ts`.
- `lib/events/slot-requests.ts` has its own `fmtDate` and `fmtTime` next to `dayText` and `timeText` in `series.ts`. They format dates differently ("Tue Nov 17" vs "Tue, Nov 17"), so the ask panel doesn't match the rest of the request page.

## How to look for more

- Search for small local helpers that redo shared ones: `toMin`, `fm`, `fmtDate`, `fmtTime`, `padStart(2, "0")`, `const add = (to`, `function Submit`. Compare each with `lib/text.ts`, `lib/dates.ts`, `lib/format.ts`, `lib/events/series.ts` and `lib/notices.ts`.
- Pages that build "What happens next" or "Waiting on" text themselves instead of asking `lib/registry.ts`.
- Server actions that save a card without going through `lib/card-actions.ts`.
- Forms that draw the same panels: `EventForm` and `TimeForm`, and the forms under `app/purchases`, `app/marketing` and `app/it-maintenance`.
