# IAR Internal Tools Portal — Project Plan

Oct 19, 2026 · @Kashif

> **Start here.** This is the umbrella plan for the IAR portal. The live, editable copy is a [Claude doc](https://claude.ai/code/artifact/3c8494a5-1c2d-4c94-a234-fb35f36e1630); this file is a snapshot of it — re-export after editing the doc. Related:
> - [purchase-requests-plan.md](purchase-requests-plan.md) — detailed design of the Purchase Requests module (PO data analysis, workflow, data model, card receipts, controls). Its platform section (Apps Script + Sheet) is superseded by the Architecture section below; everything else still stands.
> - [letter.md](letter.md) — intro letter to the office/Shura for Purchase Requests.
> - [../app/index.html](../app/index.html) — clickable Purchase Requests prototype (sample data).

## Summary

IAR will build one internal portal, signed into with an @islam1.org Google account, that replaces the Requisition Form, the Program Request Form and the Marketing/AV Request Form. What each person sees depends on their Google Groups.

At its core is a request card. It is opened once, owned by the requester, and moves through its stages while the teams it needs pick up their own tasks. Nobody types the same event into three forms again.

Phase 1 delivers the portal shell, Purchase Requests (already designed), and Event cards with automatic room checks against IAR's Google Calendar. Later phases add the gym rental front door, the daily run sheet, event close-out and further modules. The design keeps rooms, groups, policies and fees as settings, so other masjids could use it later.

## Problems today

One event today can take three separate forms on two platforms. Status lives in people's inboxes.

| Problem | Where it shows up |
| --- | --- |
| The same event entered over and over | The Program Request Form (Microsoft Forms) handles approval and rooms. The Marketing/AV Request Form (Google Forms) says plainly it no longer takes event marketing. Any spending needs a separate Requisition Form |
| Rooms checked by hand | The requester is told to check the IAR calendar themselves. The office then confirms by email within a week |
| Purchase requests that get lost | Email clutter, missed approvals, storage limits, forms owned by individuals that break when staff leave, no sub-account splits. 12 requests were waiting 7 to 44 days at last count |
| Rules in people's heads | The 2021 room policy contradicts the forms (fire pit, cafe minimum), so nobody can check requests consistently |
| No record after the event | No actual cost per event, no room-condition record tied to the request, no deposit tracking |
| No shared daily view | Security and facilities have no single list of what is happening where today |

### The forms being replaced

- **Program Request Form** (Microsoft Forms): requester name/email/mobile; program title and description; event start/end date and time; room (25 options with capacities, plus off-site); room reservation start/end including setup and teardown; registration required (yes/no); further pages (registration details, fire pit waiver) not yet reviewed. Approval = a confirmation email from the office.
- **Marketing/Multimedia/AV Request Form** (Google Forms, IAR account): email; request type — program/event to market, non-event graphic, new webpage, event A/V support, announcement, highlight, minor web update, staff badge, custom. Branches by type; two more sections (custom redirect, physical signage) exist but no choice leads to them. Asks for 3 weeks' notice; reviewed weekly by the marketing team. How each question maps to the portal: see "Marketing questions" below.
- **Requisition Form** (Google Forms + Form Approvals): see purchase-requests-plan.md.
- **Gym reservation form**: external-facing; not yet reviewed.

## Principles and decisions

| Decision | What it means |
| --- | --- |
| Google is the only directory | Sign-in is @islam1.org only, so personal Gmail accounts are out. Google Groups decide who sees which module. No Microsoft Forms |
| IAR's Google Calendar is the source of truth for bookings | The portal reads and writes the calendar. Nothing gets booked outside it. The raleighmasjid.org reservation page gets retired or fed from the calendar |
| One card per request, owned by the requester | The sponsoring committee is co-owner, and the chair can reassign the card. A card never ends up with no owner |
| Teams work their own queues | Marketing, facilities, security and finance see their tasks across all cards. They never need to open each event |
| Notify only when someone needs to act | Action-needed alerts go out right away. Everything else goes into a digest or the portal's activity feed |
| Rules are automated as flags, not hard blocks | The office can override with a recorded reason |
| Mission review only where it matters | New programs, outside groups or speakers, fundraisers, and events above a size or budget threshold. Recurring series are approved once per season |
| Ready for other masjids from the start | Rooms, groups, priority tiers, fees and policies are settings stored as data. Microsoft sign-in can be added later |
| Run by the organization, not a person | Shared Drives, a service account and IAR-owned hosting. The admin role is held by a group, not one individual |

## The event card

Each event is one card. The requester opens it, the portal checks it automatically, it's approved once, and then each team works its own piece until the card closes.

```
Submitted ──▶ Auto checks ──▶ Mission review ──▶ Office approval
(requester    (room hold,     (only when          (within one week)
 owns it)      rule flags)     triggered)               │
     ▲                                                  │
     └────────── changes requested ◀────────────────────┤
                                                        ▼
Closed ◀── Close-out ◀── Event day ◀────────────── Approved
(record)   (costs,       (on the run sheet)        (team tasks unlock)
            attendance)
```

Mission review is the only optional stage. A card that's denied or cancelled leaves the flow and keeps its record.

**What the requester enters once**, taken from today's Program Request Form:

- Title, description, sponsoring committee (picked from the requester's groups), contact details filled from Google
- Event start and end, plus a room reservation window that covers setup and teardown
- Room or rooms, expected attendance, whether food is served, public or internal, whether registration is needed
- Optional budget estimate
- For public events, the marketing brief: one-line subtitle, announcement text, flyer content, other details to publish, registration and payment instructions, when to start marketing, a Drive link to files, and a "details are final" confirmation
- If A/V support is needed: the kinds of support, what the event includes, and an acknowledgement that A/V isn't guaranteed

**Tasks added to the card**, each prefilled from the card:

- Marketing: flyer, announcement, webpage, highlight. Locked until approval, per policy
- AV support and facilities setup
- Security: after-hours coverage and the before/after room check
- Purchase requests: linked POs, coded to the event
- Payments: fee and deposit for community MPH use, deposit refund after the room check

**Ownership and notifications**

- The requester owns the card, the sponsoring committee co-owns it, and the chair can reassign it
- Each task has one team and a due date. Overdue tasks move up to the team lead
- Alerts go to whoever needs to act next. Owners get a status digest, and anyone can follow a card

## Modules

All modules sit on one request engine and one sign-in. Each module is a set of fields, an approval chain and a group that can see it.

| Module | Who sees it | What it does | Phase |
| --- | --- | --- | --- |
| My Requests | Everyone signed in | One list of the person's own cards (events, purchase requests, rentals they sponsor), with status and what is waiting on them | 1 |
| Purchase Requests | All staff and committee members; finance reviews | Pay a vendor, reimburse me, card receipts. Line items split across sub-accounts, with a W-9 registry. Can be linked to an event card | 1 |
| Event cards | Committee members submit; office, teams and the CEO review | The full event lifecycle above, with room holds on IAR's Google Calendar | 1 |
| Team queues | Marketing, AV, facilities, security, finance | Board and list of open tasks across all cards, filtered to the team | 2 |
| Marketing requests | Everyone submits; the marketing team reviews weekly | Marketing work not tied to an event: graphic design, physical signage, announcements, highlights, new webpages, small website updates, custom short links or redirects, staff badges, and anything else. Each type asks its branch of today's form. Weekly review → scheduled with a done-by date → in progress → done, or a question back to the requester, or declined. Event marketing and event A/V stay on the event card | 2 |
| Daily run sheet | Security, facilities, office | One printable page per day and campus: time, room, event, contact, setup, security notes, after-hours flag | 2 |
| Event close-out | Card owner; finance | Attendance, actual spend from linked purchase requests vs. budget, room condition from security, deposit refund | 2 |
| Library | Everyone signed in; each drive shows only to its group | Home for Shura documentation, policies, minutes and other files, kept in IAR-owned shared drives. Browse by team, search across everything the person can open, tag and categorize, policy owners and review dates, links from cards to the files they rely on. See the Library section | 2 |
| Facility rentals (gym) | Public front door; office reviews | Outside renters book without an IAR account (email verified). Fee, deposit, agreement, and an insurance upload if the policy requires it. Same approval engine | 3 |
| Social & Welfare aid | S&W committee and finance only | Private case record and aid payments, kept out of general purchase requests | 3 |
| Public calendar feed | Public | Approved public events published to the website and to Salam Y'all | 3 |
| IT & Maintenance tickets | Everyone submits; IT and facilities teams work their queues | Report a problem with a room and, optionally, a piece of equipment; urgency; photo. New → assigned → in progress → waiting on parts → resolved, with the reporter notified. Facilities is a paid team that works in Jira today; this module brings that work into the portal so requesters can see how their request is progressing | 2 |
| Asset tracker | Facilities, IT, office | Tagged equipment with location, cost, warranty and serial; repair history from tickets; portable items checked out to a committee or event and checked back in; warranty-ending alerts | 2 |
| Budget | Chairs (their cost centers), finance, executive, Shura (read) | Built on the FY2026–27 budget (July 1–June 30): IAR General Fund cost centers plus the Page Road campus. Sankey of funding source → cost center → spent, committed, available, with a table. A Revenue tab sorts everything received into three kinds: **unrestricted gifts** to IAR (General Fund), **designated donations** to a committee (e.g. Da'wah) and **program revenue** earned by a committee (e.g. Youth); Page Road tracks tuition, endowment and donations against its plan. Finance imports a QuickBooks export (CSV now, QuickBooks Online connection later); rows are sorted by account and class, and anything without a committee waits for finance to assign it. Expense rows are matched to purchase requests | 3 |
| Shura / Board dashboard | Shura / board members (group `portal-shura@`) | Organizational health at a glance, counted live from the other modules: events in the next 30 days (and expected attendance, items awaiting review, open close-outs), maintenance cases by kind (repair, preventive, improvement) and IT cases, with late and urgent counts and preventive schedules kept on time; purchase requests in progress and how long they wait; community care as totals only; a short money summary (General Fund cushion, received and spent against the year, committees ahead of pace). A "Needs the Shura" list gathers mission reviews, capital projects, policy drafts and overdue policy reviews, and open Shura requests; a key-dates list covers insurance, inspections, the books review and the annual meeting. Money detail lives in Budget (a Year to date tab), not here. Shura members can send requests: a report from finance, a budget amendment or a spending review from the executive. Approved amendments are applied in QuickBooks and re-imported | 3 |
| Later | By group | Onboarding/offboarding checklist (groups, cards, keys, Drive), key checkout, volunteer signup, event templates | 4+ |

## Library

**Decided (Oct 20, 2026):** the portal is also the home for IAR's documents, not only for files attached to cards. It starts with Shura documentation and policies and grows from there. Files live in Google shared drives owned by IAR; the portal is the way in, not a second copy.

**Principle: Drive enforces access, the portal presents it.** A Google Group can be a member of a shared drive with a role, so the groups that already decide which portal modules a person sees can also decide which drives they can open. The portal calls Drive with the signed-in user's own token, so browse and search only return what that person can already open. The portal keeps no file permissions of its own to get wrong.

| Shared drive | Who has access (group → role) | Contents |
| --- | --- | --- |
| IAR Shura | `portal-shura@` → Content manager or Viewer by need | Minutes, resolutions, board packets, budget approvals |
| IAR Social & Welfare | `portal-sw@` → Contributor; a few named managers | Case files and aid records. Most restricted drive |
| IAR Policies | All staff group → Viewer; Shura and executive → Contributor | Approved policies: rooms, purchasing, rentals, volunteer, HR |
| IAR Finance | `portal-finance@` → Content manager | Receipts, W-9s, invoices, QuickBooks exports |
| IAR Operations (and per-team drives if needed) | Each team's group → Contributor | Run sheets, contracts, event files, templates |

Exact drives and role levels are open (see questions below).

**Setup in the Workspace admin console**
- Add each group as a drive member with its role (Drive API: `permissions.create`, type `group`, `supportsAllDrives=true`). Nested groups work.
- On restricted drives, allow access to members only and turn off sharing to non-members and link sharing. Give Manager to Kashif and one backup admin only, since Managers can change membership.
- Make restricted groups invite-only with hidden member lists so the groups themselves are not discoverable. Consider turning off download, print and copy for Viewers on Social & Welfare.
- Group membership changes can take a few minutes to reach Drive.

**What the portal adds on top of Drive**
- A Library module that lists drives grouped by team and searches across everything the user can open.
- Tags and categories (policy, minutes, contract, form) stored in the portal database against the Drive file ID, since Drive has no good way to do this itself.
- Policy documents with an owner and a review date, with a reminder when one is stale. Useful for the Shura's policy refresh.
- Links between cards and files, so an approved budget or policy can be linked from the requests that rely on it. The link stores the Drive file ID, never a copy.
- Upload into the right drive and folder, with the folder structure created automatically.

**Technical notes**
- Sign-in requests the Drive scope so the portal can act as the user. A service account (already planned) is used only for setup tasks such as creating folders and attaching card files.
- The database holds file IDs, tags, owners and review dates, never file contents. W-9s and other tax-ID documents stay only in the restricted drive, as before.
- Reusing `portal-shura@` for both the Shura module and the Shura drive keeps one place to manage membership. If someone ever needs the module without the documents, split into a second group.

**Risks**
- Group-based access is only as good as group hygiene. Review membership of restricted groups each quarter and on every offboarding (ties into the onboarding/offboarding checklist in Later).
- Someone with Contributor access can still copy a file's content elsewhere. Drive permissions limit access, not what a person does with what they read.
- A general library invites clutter. Give each drive an owner and require a category on upload.

## Policy automation

Most of the [2021 Room Reservation Policy](https://raleighmasjid.org/wp-content/uploads/2021/07/room-reservation-policy.pdf) can be checked by the portal. Judgment calls (speakers, topics, conduct) stay with people.

| Policy rule | Portal behavior | Type |
| --- | --- | --- |
| Daily prayers, Jumuah, Eid, Ramadan activities in the Mussalah and MPH | Standing holds on the calendar; conflicting cards flagged when submitted | Block-out |
| Mon–Fri school hours: both buildings for Al-Iman and An-Noor | Standing holds during school hours | Block-out |
| Sunday until Zuhr: both buildings for Al-Furqan | Standing hold, ending at Zuhr time for that date | Block-out |
| Ramadan: MPH for S&W iftar (not Sundays), sahoor in the last 10 nights | Holds created each year from the Ramadan dates | Block-out |
| Food pantry: red building first floor, 1st Saturday mornings and every Ramadan Saturday | Recurring hold | Block-out |
| Priority tiers: school, youth, Shura/admin, S&W, then committees, then community. Funerals and Izzah outrank all; no Izzah on Friday evening | A higher-tier request against a lower-tier hold opens a conflict | Conflict |
| Must be sponsored by an IAR committee | Required sponsor field, filled from the requester's groups | Required field |
| Conflicts: the two chairs agree first, then the CEO's decision is binding | Conflict thread between the two owners, with an escalate-to-CEO button | Workflow |
| Conference room: leadership, imams, chairs only; requester must attend; IAR business only | Room shown only to those groups | Access |
| MPH needs a 2-hour cleaning gap | Gap added to the hold automatically | Calculated |
| Food only in the MPH, Room 240 and school rooms during school | Flag when food is selected for another room | Flag |
| Community MPH events: $200 fee and $100 refundable deposit | Payment task added; refund task opens after the room check | Task |
| After-hours security: 2-hour minimum, charged to the event | Fee estimated from event times and added to the card | Calculated |
| No advertising or signage until approved | Marketing task locked until approval | Lock |
| Confirmation within one week | Office deadline; overdue cards move up to the office lead | Deadline |
| Security records room condition before and after | Check-in and check-out task on the run sheet, result saved to the card | Task |
| Submitting means accepting the rules and liability statement | Required checkbox with a link to the current policy version | Required field |

## Policy gaps for the Shura

The 2021 policy needs a short refresh before its rules go into the software. Rules enforced by code have to be exact.

- [ ] **Fire pit:** the Program Request Form offers it, but the policy bans open fires and flames. Allow it with a waiver, or remove it
- [ ] **Al-Maidah Cafe:** the $100/hour minimum purchase is on the form but not in the policy
- [ ] **Committee room:** the policy names both Room 240 and Room 280 as the default. Fix the room list and capacities
- [ ] **Deposit wording:** "fortified" should read forfeited. Set a refund deadline and say who decides
- [ ] **Who submits:** the policy says only Admin chairs or staff enter reservations. The portal lets committee chairs submit directly
- [ ] **Gym and outside renters:** no rental rates, insurance requirement or agreement exists. Needed before the public front door
- [ ] **Mission review:** written criteria, when it is triggered, who decides, and how long the decider has
- [ ] **Lead times:** the policy has none. Marketing asks for 3 weeks. Set a minimum per event type
- [ ] **New spaces:** the Community Flex Room, Red Brick rooms and the Women's Prayer Hall appear on the form but not in the policy

## Architecture

**Decided (Oct 19, 2026): Google Cloud.** The portal runs on Cloud Run with Firestore as its database, in an IAR-owned Google Cloud project under the islam1.org organization, connected to IAR's Google Workspace through a service account. Linked cards, tasks, rules settings and a multi-masjid future outgrow Apps Script and Google Sheets, while staying on Google keeps data under the same organization, admin console and sign-in IAR already secures — the concern the Purchase Requests plan raised about W-9 data leaving Workspace. Expected hosting cost at IAR's volume is near zero to low tens of dollars a month.

```
Staff & committees ─(Google sign-in, @islam1.org)─┐
                                                  ├─▶ Portal web app ──APIs──▶ IAR Google Workspace
Outside renters ──(email-verified link)───────────┘         │                 • Directory: groups → modules
                                                            ▼                 • Calendar: source of truth for rooms
                                                     Portal database          • Shared Drive: receipts, W-9s, waivers
                                                     (cards, tasks,           • Gmail: action alerts, digests
                                                      settings, audit log)
```

The calendar stays the booking record. The database holds everything about the card that a calendar can't. W-9s and other tax-ID documents stay only in the restricted Shared Drive, never in the database.

**Core records**

| Record | Holds |
| --- | --- |
| Org, campus, room | Name, capacity, calendar ID, food allowed, cleaning gap, fees. One org row per masjid |
| Role mapping | Google Group to the modules and actions it unlocks |
| Card | Type (event, purchase, rental, aid), owner, co-owner committee, status, dates, links to other cards |
| Task | Card, team, assignee, status, due date, locked-until rule |
| Hold | Card, room, start/end with setup and teardown, Google Calendar event ID, tentative or confirmed, expiry |
| Rule | Kind (block-out, flag, calculated, lock), parameters, policy section, active dates |
| Line item, vendor, account | The purchase request data model, unchanged (see purchase-requests-plan.md) |
| Comment, attachment, audit log | Every change, who made it and when; files kept in the Shared Drive |

**Access groups to create** (names are suggestions): `portal-staff`, `portal-committee-chairs`, `portal-office`, `portal-finance`, `portal-cardholders`, `portal-marketing`, `portal-av`, `portal-facilities`, `portal-security`, `portal-sw`, `portal-shura`, `portal-executive`, `portal-admins`. Each restricted group that also guards a shared drive (Shura, Social & Welfare, Finance) is added to that drive as a member; see the Library section.

## Roadmap

Phase 1 replaces the two forms that hurt the most. Each later phase waits on a sign-off rather than a date, because the office and Shura decisions set the pace.

| Phase | Scope | Gate to start the next phase |
| --- | --- | --- |
| 0 · Groundwork | Repo and hosting, service account, access groups, room list with calendar IDs, rules list drafted with the office | Office signs off the rules list and approvers |
| 1 · Shell, Purchase Requests, Event cards | Sign-in, My Requests, PO module, event cards with calendar holds and rule flags; pilot with a few committees | Pilot runs clean; old Requisition and Program Request forms retired |
| 2 · Team queues, run sheet, close-out, Library | Marketing, AV, facilities, security queues; daily printable run sheet; close-out with actual spend; Marketing form retired; Library with the Shura and Policies drives | Shura approves the refreshed room policy, including rental terms |
| 3 · Gym rentals, S&W aid, public calendar | Public front door for outside renters; private aid cases; approved events fed to the website and Salam Y'all | A full Ramadan run on the portal |
| 4 · More modules, other masjids | Maintenance, onboarding/offboarding, budget vs. actual, keys and assets; second org on the same settings model | — |

Purchase Requests and Event cards share the shell, so building them together costs little more than building one.

## Risks, open questions and next steps

The biggest risk is people, not code. The portal only works if every booking goes through it and the office uses it instead of email.

| Risk | Mitigation |
| --- | --- |
| Bookings still made outside the calendar | The portal is the only way to book. The office stops confirming by email once the pilot ends |
| Office or teams keep working from email | Their queue is the only place approvals happen. Email alerts link straight to the card |
| Too many alerts, as with the current PO form | Alerts only go to whoever must act; everything else goes in a digest |
| Mission review turns into gatekeeping | Shura-approved criteria, limited triggers, a time limit for the reviewer |
| One builder holds all the knowledge | Repo owned by IAR, written setup guide, admin role held by a group, not a person |
| Scope creep before Phase 1 ships | Phase 1 is only the shell, POs and event cards. Everything else waits for its gate |

**Open questions**

- [ ] Who approves events today, and does it vary by room or campus?
- [ ] Is IAR's calendar one shared calendar, or one per room? Per-room calendars make conflict checks reliable
- [ ] What happens to the raleighmasjid.org reservation page: retire it, or feed it from the calendar?
- [ ] Who runs the marketing weekly review, and who owns AV?
- [ ] Gym rental rates, deposit and insurance terms
- [ ] Dollar limit for executive approval on purchase requests (carried over from the PO plan)
- [ ] Which committees pilot Phase 1?
- [ ] Library: which shared drives to create, and the role each group gets on each
- [ ] Library: who owns each drive and each policy, and the review cadence for policies
- [ ] Library: does Social & Welfare need download/copy blocked, and who are its named managers?
- [ ] Library: migrate existing Shura and policy files from current Drive folders, or start fresh?

**Next steps**

- [x] Connect the existing repo (`wizkashifa/iar`)
- [x] Confirm the stack: Cloud Run + Firestore in an IAR-owned Google Cloud project
- [x] Build the shell: Google sign-in limited to @islam1.org, group-based navigation, My Requests (`portal/`, sample data in dev mode)
- [ ] Google Cloud project, Firestore, OAuth client and domain-wide delegation (`docs/setup.md`)
- [x] Purchase Requests module on the shell (design in purchase-requests-plan.md)
- [x] Portal-wide notifications (bell plus email to whoever acts next), search by request number or words, a feedback button on every page for beta testers, and out-of-office handoff of approvals
- [ ] Set up the portal's sending mailbox and the gmail.send scope (`docs/setup.md`, step 8)
- [ ] Event cards with calendar holds and rule flags
- [ ] Create the access groups and a service account in Google Workspace
- [ ] Pull the room list and calendar IDs from IAR's Google Calendar
- [ ] Review the rules table and approvers with the office
- [ ] Draft the policy refresh for the Shura
- [ ] Create the shared drives and add the access groups as members (Library)
- [ ] Add the Drive scope to sign-in and build the Library module (Phase 2)

## Recurring reservations (proposed)

- Every reservation has an end date. There is no open-ended option.
- The requester picks the end date, but it can be no more than 3 months after the first date (Portal Settings can raise the limit to 6). Longer needs are met by renewing.
- Each session is checked against the calendar; conflicts list how many dates clash.
- Renewal: a committee may request its next period no earlier than 30 days before the current end date (adjustable). The renewal starts after the current series ends and goes through normal approval.
- In production, school hours, prayers, Jumuah and the food pantry come from the IAR Google Calendar, so the standing-hold rules above are demo-only.

## Marketing questions

Every question on the Marketing/Multimedia/AV Request Form (last updated 9/10/26) is asked somewhere in the portal, or answered by it. Event marketing and event A/V go on the event request; everything else is a Marketing Request. The demo (`demo/index.html`, `briefSection`, `avSection` and `MK_TYPES`) uses the form's wording.

| Form questions | In the portal |
| --- | --- |
| Email, name, committee/team (Q1, 67–72) | From sign-in. Everyone belongs to at least one committee or team (a Google Group). The requester picks from their own committees and teams, plus any committee they direct |
| Approved through the Program Request form? (Q41, 53) | Dropped. Marketing unlocks when the event is approved |
| Committee + event name, date(s), time(s), room, public, recurring (Q31–36, 42, 45, 54, 56–58) | Already on the event card |
| One-liner subtitle, detailed description, announcement text, flyer content, other info, must-include on flyer, registration, payment, start marketing, details final, comments (Q43–52, 55, 59–66) | Event card, "For marketing" section (public events) |
| A/V support type, event includes, A/V not guaranteed, comments (Q37–40) | Event card, "For A/V" section |
| Is this an IAR event / IAR school event (Q33) | Not asked; school events aren't booked through the portal |
| Non-event graphic (Q25–27) | Marketing request: Graphic design |
| Physical signage (Q22–24) | Marketing request: Physical signage |
| Announcement or community update (Q28–30) | Marketing request: Announcement |
| Highlight (Q18–21) | Marketing request: Highlight |
| New webpage (Q16–17) | Marketing request: New webpage |
| Minor website update (Q3–5) | Marketing request: Small website update |
| Custom redirect, with the iar.to/new self-service note (Q8–10) | Marketing request: Custom short link or redirect |
| Staff badge (Q11–15) | Marketing request: Staff badge |
| Custom request (Q6–7) | Marketing request: Something else |
| File upload, Google Drive link (Q73–74) | Drive link on every marketing request and on the event's marketing brief |
