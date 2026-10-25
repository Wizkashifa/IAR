# Moving facilities from Jira into the portal

The paid facilities team works in Jira today. The goal (`CLAUDE.md`) is to bring that work into the portal's IT & Maintenance module, so the people who report a problem can follow it until it's fixed. Keeping Jira and syncing with it is the fallback only if moving doesn't work out.

We haven't yet sat down with the facilities team to see what they actually use in Jira. This page lists what the portal covers now, how that compares with typical Jira use, and the questions for that session. The answers decide what gets built next. We build nothing for Jira features nobody uses.

## What the portal covers now

| Need | In the portal | Where |
|---|---|---|
| Report a problem from a phone, with a photo | AV/IT/Maintenance form, phone camera | `/it-maintenance/new` |
| Requests reach the right team | Building and maintenance → Facility Maintenance; IT, A/V and tech → IT Services | Team choice on the form |
| Pick up, assign, hand on | "I'll take it", assign to a team member; chairs and the office can reassign | Ticket page |
| Work through it | Start → waiting on parts (what's on order) → mark fixed (what was done) | Ticket page, **My work today** |
| The reporter follows along | Every step notifies the reporter; they confirm the fix or say it's not fixed (reopens it) | Notifications, Chat |
| Unconfirmed fixes don't linger | Fixed tickets close themselves after 7 days | Daily job |
| Urgency and response times | Low / normal / high / urgent, each with a pick-up target; one reminder when a high or urgent ticket sits untouched | Daily job |
| Target dates and lateness | Target date per ticket; "3 days late" or "Not started for 30 hours" on the ticket, the board and My work today | Ticket page |
| A day's work on a phone | **My work today**: yours (urgent and late first, then due today), what nobody has taken, preventive work this week; one-tap Start, Waiting on parts, Mark fixed with a photo | `/it-maintenance/today` |
| The team's view | Board by status and a list, with quick filters (nobody has it, mine, urgent and high, waiting on parts, late) | `/it-maintenance?view=team` |
| Preventive maintenance | Schedules (weekly to yearly) open tickets by themselves on the day | `/it-maintenance/schedules` |
| Related problems | Link tickets: related, or the same problem reported twice; both tickets show the link | Ticket page, under More |
| Equipment | Free-text equipment on each ticket and schedule ("Rooftop AC unit 2"), shown with the room | Form, ticket page |
| Where it is | Room or place on every ticket; on My work today the room links to what's booked there today | My work today |
| Comments and quick replies | Comments everyone on the ticket sees; three ready-made replies for the team | Ticket page |
| Following a ticket | Anyone who can open it can follow it | Ticket page |
| Bringing open work over | One-time import from a Jira CSV export, with a preview first | `/it-maintenance/import` |
| Who's on the team | The Facility Maintenance Google Group (chair = Owner, vice chair = Manager) | Google Groups |

## Typical Jira use, and where the portal stands

| Jira feature | Portal | Notes |
|---|---|---|
| Issues with status, assignee, priority, due date | Yes | Statuses are fixed to the facilities flow above, not configurable |
| Comments, attachments, watchers | Yes | Attachments are photos for now |
| Linked issues | Yes: related, duplicate | Not "blocks" or "is blocked by" |
| Labels | Kept from the Jira import; not editable | Ask if they're used |
| Components | No | Team plus room plus equipment covers most uses; ask |
| Custom fields | No | Ask which ones they rely on |
| Saved filters (JQL) | Fixed quick filters only | Ask which searches they run every day |
| Bulk edit | No | Ask how often |
| Sub-tasks | No | Ask |
| Epics, sprints, backlog | No | Unlikely for a small paid team; ask before building |
| Time tracking (work logs) | No | Ask if anyone reports on hours |
| SLA timers | Pick-up targets by urgency, reminders and lateness | No pause-on-waiting clock |
| Reports and dashboards | No | Ask what reports, if any, go to the office or Shura |
| Email-to-ticket | No | Requests come through the portal form; ask if people email them now |
| Mobile app | The portal on a phone (My work today), installable to the home screen | No offline mode |
| Asset register | Free-text equipment only | The asset tracker (repair history per item) is planned |

## Questions for the facilities team

1. **A normal day:** Walk us through yesterday. Where did each job come from (Jira, a phone call, a text, someone stopping you in the hall)?
2. **Jira screens:** Which screens do you open every day? Show us the filters or boards you use.
3. **Fields:** Which fields do you fill in on every issue? Are there custom fields, components or labels you'd miss?
4. **Statuses:** Does "new → assigned → being worked on → waiting on parts → fixed → confirmed" match how you work? Anything missing, like waiting on a vendor or waiting on approval to spend?
5. **Spending:** When a fix needs money, how do you get approval today? (The portal's Purchase Requests could link to the ticket.)
6. **Equipment:** Do you keep a list of equipment (AC units, water heaters, fire extinguishers) with serial numbers, warranties or repair history? Where?
7. **Preventive work:** What recurring jobs do you have (filters, gutters, fire inspections), and how often? Who tracks them now?
8. **Reports:** Does anyone outside the team get a report from Jira (the office, the Shura, the CEO)? What does it show?
9. **Time:** Do you log hours against issues? Does anyone use those numbers?
10. **Vendors:** How do you track outside contractors (plumbers, HVAC)? Should a ticket record which vendor did the work?
11. **Phones:** Do you work mostly from a phone on site? Is there anywhere with no signal, where you'd need to note things offline?
12. **Getting the word out:** How should requesters be told about urgent issues (a leak, no heat)? Is a Chat message enough?
13. **Moving over:** Is there a quiet week to run both side by side for two weeks before Jira is turned off? Who should check the imported tickets?
14. **Deal-breakers:** What would make you want to stay on Jira?

## After the session

- Write the answers into this page.
- Add only what they use to the IT & Maintenance plan (`lib/modules.ts` plannedFeatures).
- Pick the two-week side-by-side window and the Jira cut-off date.
