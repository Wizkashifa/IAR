# Inquiries: website tickets for the Imam Office, Da'wah and Fundraising

**Status:** proposed, not built · **Last updated:** 2026-10-28

People outside IAR send questions and requests through forms on the IAR website (built in GoHighLevel). Today those arrive as emails nobody tracks. This plan turns each one into a ticket in the portal, in the right team's queue, answered by email and followed until it's done, like IT & Maintenance does for building and tech problems.

The GoHighLevel developer's side (forms, payload, testing) is in [ghl-intake-spec.md](ghl-intake-spec.md). This page is the portal's side.

## Decisions

- **Intake stays on the website.** Requesters never sign into the portal. They hear back by email, with a reference number.
- **A webhook, with email as the backstop.** GoHighLevel POSTs each submission to the portal (`/api/intake/ghl`) and emails a copy to `inquiries@islam1.org`. The portal works from the webhook; the email copy is there if the webhook fails. If GoHighLevel can't send the webhook, the portal reads that mailbox instead (the spec's email-only option). *To confirm.*
- **Teams are Google Groups.** A desk is a team group: Imam Office (`portal-team-imams@`), Da'wah (`portal-team-dawah@`), Fundraising (`portal-team-fundraising@`). Whoever is in the group works its inquiries; Owner and Manager can reassign. Any other team can become a desk later from Portal Settings, with no code change.
- **Sorting is data, not code.** Which topic goes to which desk, the keyword rules and the person who sorts the rest all live in Portal Settings.
- **The portal sends the email to the requester**, from the portal's mailbox under the desk's name ("IAR Imam Office"), so every message has the reference number and is logged on the ticket.
- **No people data in the repo.** Requesters' details live only in Firestore.

## Its own module, on the ticket template

IT & Maintenance is the model, but inquiries get their own module (`lib/inquiries/`, card type `inquiry`, numbers `IN-1001` onward, pages under `app/inquiries/`) rather than more teams on tickets. Tickets assume a signed-in reporter who confirms the fix, a room and equipment, parts and preventive schedules; inquiries have an outside requester reached only by email, stricter privacy, and a reply instead of a fix.

What's reused as is: the module template (`registry.ts`, `kinds.ts`, `module.ts`), `workflow-core.ts` (history, errors), `card-actions.ts`, `RequestPage`, `Activity`, `FlashNote`, `notices.ts` and Chat alerts, Team Queues, What's stuck, search, the daily job, ticket links ("same as IN-1040"), and the urgency/response-time pattern from `lib/tickets/types.ts`.

What's new: the intake endpoint, the sorting rules, email to and from the requester, and the desk settings.

## How a ticket moves

```
new → assigned → in progress ⇄ waiting on requester → answered → closed
                       ↘ moved to another desk (back to new there)
new / assigned → closed without reply (spam, duplicate, nothing to answer)
```

| Step | Who | What happens |
|---|---|---|
| New | Desk | Arrives; the desk's Chat space is alerted. The requester gets "We received your message, reference IN-1042" |
| Assigned | Desk member, or chair/vice chair | "I'll take it" or assign to someone in the group |
| In progress | Assignee | Working on it. Internal notes stay internal |
| Waiting on requester | Assignee | A question went to the requester by email. Reminder after 7 days; closes after 14 with no reply |
| Answered | Assignee | The reply went out. Closes itself after 14 days unless the requester writes back |
| Moved | Any desk member or the sorter | Goes to another desk's New, with a note; history shows the move |
| Closed without reply | Desk | No email goes out (spam, a duplicate linked to another ticket, or handled by phone) |

Response targets per desk, set in Portal Settings (suggested: 2 working days; 1 for Imam Office). The daily job reminds the desk once about anything untouched past its target, as tickets do.

Fewer options than IT & Maintenance: no rooms, equipment, parts, photos from the team, preventive schedules or Jira import.

## Sorting (the general form)

Each submission is placed in this order; the first rule that matches wins, and the ticket's history says which one:

1. **The form's desk.** The three team forms send `desk`; it goes straight there.
2. **The topic.** Portal Settings maps each topic label to a desk ("Zakat question" → Fundraising, "Something is broken at the masjid" → Facility Maintenance or the office).
3. **Keywords** (phase 2). Portal Settings holds simple rules ("nikah", "marriage" → Imam Office). Tickets sorted this way are marked "sorted by keyword, please check".
4. **The sorter.** Everything else goes to a sorting desk (suggested: the IAR office, `portal-role-office@`), who moves it by hand.

Unknown topics never fail: they fall through to the sorter, and admins see "topic not mapped" in Portal Settings so the map can be fixed.

Later, if hand-sorting is heavy: a suggested desk from Claude on the sorter's screen, which a person accepts. Never automatic.

Topics that belong to existing modules (renting a space, something broken) still arrive as inquiries; the desk that gets them links or re-files them. Turning them straight into tickets or rentals waits until the volume shows it's worth it.

## Who can see what

- A desk's inquiries are visible only to that desk's group and the person assigned. Not to other desks, not to the office (except the sorter's own tickets, until moved), not to everyone.
- **Imam Office inquiries are confidential** (counseling, marriage, conversion). Only the Imam Office group. Admins doing support see the title and status but not the message, and opening the full ticket is logged (`lib/audit.ts`). *To confirm with the Imam Office.*
- The Inquiries module shows in the menu only for members of a desk group or the sorting desk.
- Donor details stay in the ticket; nothing about payments is collected (the spec tells GoHighLevel not to send it).

## Email to and from the requester

- **Phase 1:** desk members write replies in the portal; the portal emails them from the portal mailbox as "IAR Imam Office" with the reference in the subject. Reply-To is the desk's group, so a reply from the requester reaches the desk's inbox (staff paste it onto the ticket if it matters).
- **Phase 2:** replies come back onto the ticket. Reply-To becomes `portal+IN-1042@islam1.org`; the portal reads its mailbox and adds the reply as a comment, reopening an answered ticket. Needs the Gmail read scope added to the portal mailbox's delegation.
- Templates per desk (acknowledgement, "we need more information", closing) in Portal Settings, edited by the desk's chair.

## Portal Settings additions

| Setting | Who edits | Example |
|---|---|---|
| Inquiry desks: which team groups take inquiries, their sender name and response target | Admins | Imam Office · "IAR Imam Office" · 1 working day |
| The sorting desk | Admins | IAR office |
| Topic → desk map | Admins, each desk's chair for its own topics | "Pledge" → Fundraising |
| Keyword rules (phase 2) | Admins | "janazah" → Imam Office |
| Email templates | Each desk's chair | Acknowledgement text |
| Intake key | Admins (stored in Secret Manager, never shown again after it's made) | — |

## The intake endpoint

`POST /api/intake/ghl`, as in the spec. It checks the key (constant-time compare), validates the payload with a plain function that has tests (`lib/inquiries/intake.ts`), drops repeats by `submission_id`, rate-limits by email address, sorts, saves the card, copies attachments into an "Inquiries" Shared Drive, emails the acknowledgement and alerts the desk. `"test": true` runs everything up to saving and reports what would happen. In dev mode a page under `/dev` posts sample submissions, like the other sample data.

The email backstop: a daily check compares `inquiries@` against saved tickets and flags any submission with no ticket to the admins.

## Phases

1. **Launch:** the endpoint, the module with the steps above, the three desks plus the sorter, topic sorting, Chat alerts, acknowledgement and replies by email, Portal Settings for desks, topics and templates.
2. **Next:** requester replies threaded onto the ticket, keyword sorting, the email-backstop check, updates back to GoHighLevel (a note and a tag on the contact when a ticket is answered).
3. **Later:** more desks (Youth, Social & Welfare, Education…) from Portal Settings, a suggested desk for the sorter, turning inquiries into IT & Maintenance tickets or rentals in one step.

## Open questions

- [ ] Webhook or email-only: does IAR's GoHighLevel plan include the Custom Webhook action?
- [ ] Topic lists: each desk confirms its own (drafts in the spec).
- [ ] Who sorts the general form: the office, or someone else?
- [ ] Imam Office privacy: is "title and status only" for admins enough, or should admins see nothing?
- [ ] Fundraising: does it want the GoHighLevel updates from phase 2 at launch?
- [ ] How long closed inquiries are kept (suggested: 3 years, then deleted by the daily job).
- [ ] The Imam Office phone number for urgent funerals, shown on the forms.
