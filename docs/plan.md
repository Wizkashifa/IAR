# IAR Internal Tools Portal — Project Plan

Oct 19, 2026

> **Start here.** This is the umbrella plan for the IAR portal. The live, editable copy is a [Claude doc](https://claude.ai/code/artifact/3c8494a5-1c2d-4c94-a234-fb35f36e1630); this file is a snapshot of it — re-export after editing the doc. What the old Requisition Form's data showed, which shaped Purchase Requests, is in the last section.

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
- **Requisition Form** (Google Forms + Form Approvals): see "Purchase Requests: what the old form showed" below.
- **Gym reservation form**: external-facing; not yet reviewed.

## Principles and decisions

| Decision | What it means |
| --- | --- |
| Google is the only directory | Sign-in is @islam1.org only, so personal Gmail accounts are out. Google Groups decide who sees which module. No Microsoft Forms |
| IAR's Google Calendar is the source of truth for bookings | The portal reads and writes the calendar. Nothing gets booked outside it. The raleighmasjid.org reservation page gets retired or fed from the calendar |
| One card per request, owned by the requester | The sponsoring committee is co-owner, and the chair can reassign the card. A card never ends up with no owner |
| Teams work their own queues | Marketing, A/V, security and finance see their tasks across all cards. They never need to open each event. Committees set up and clean up their own events, so facilities has no event tasks |
| Notify only when someone needs to act | Action-needed alerts go out right away. Everything else goes into a digest or the portal's activity feed |
| Rules are automated as flags, not hard blocks | The office can override with a recorded reason |
| Mission review for every event | The committee's pillar director reviews first, then any one executive gives the final approval. The office doesn't review events. New programs, outside groups or speakers, fundraisers, and large or costly events are flagged for the reviewers. Recurring series are approved once per season |
| Ready for other masjids from the start | Rooms, groups, priority tiers, fees and policies are settings stored as data. Microsoft sign-in can be added later |
| Run by the organization, not a person | Shared Drives, a service account and IAR-owned hosting. The admin role is held by a group, not one individual |

## The event card

Each event is one card. The requester opens it, the portal checks it automatically, it's approved once, and then each team works its own piece until the card closes.

```
Submitted ──▶ Auto checks ──▶ Director review ──▶ Executive review
(requester    (room hold,     (pillar director,    (any executive;
 owns it)      rule flags)     mission review)      within one week)
     ▲                                                  │
     └────────── changes requested ◀────────────────────┤
                                                        ▼
Closed ◀── Close-out ◀── Event day ◀────────────── Approved
(record)   (costs,       (on the run sheet)        (team tasks unlock)
            attendance)
```

Every event gets mission review in two steps: the director of the committee's pillar, then any one executive. Either can approve, request changes or deny. The director step is skipped when the committee has no pillar director, or when the requester is that director; nobody reviews their own event. The IAR office and portal admins don't review events. A card that's denied or cancelled leaves the flow and keeps its record.

**What the requester enters once**, taken from today's Program Request Form:

- Title, description, sponsoring committee (picked from the requester's groups), contact details filled from Google
- Event start and end, plus a room reservation window that covers setup and teardown
- Room or rooms, expected attendance, whether food is served, public or internal, whether registration is needed
- Optional budget estimate
- For public events, the marketing brief: one-line subtitle, announcement text, flyer content, other details to publish, registration and payment instructions, when to start marketing, a Drive link to files, and a "details are final" confirmation
- If A/V support is needed: the kinds of support, what the event includes, and an acknowledgement that A/V isn't guaranteed

**Tasks added to the card**, each prefilled from the card:

- Marketing: flyer, announcement, webpage, highlight. Locked until approval, per policy
- AV support (committees do their own setup and cleanup)
- Security: after-hours coverage and the before/after room check
- Purchase requests: linked POs, coded to the event
- Payments: fee and deposit for community MPH use, deposit refund after the room check

**Asking for a booked time**

When a request clashes with another booking, the requester can ask whoever holds it to give it up, instead of only changing their own time. Prayer times and school hours are ordinary entries on the room calendars, shown and checked like any other booking.

- The ask goes to the booking's owner and their committee's chair and vice chair. For an entry made straight on the calendar, it goes to whoever made it, or to the office. The requester says why they need the time. Their request is submitted, but it doesn't hold the room or go to mission review until there's an answer
- A recurring series is asked for date by date: only the clashing dates. The rest of the series stays
- The holder can give it up and move their event, give it up and cancel those dates, or keep it. Giving it up takes those dates off the IAR calendar at once: a one-time event is removed, the last dates of a series end it early, and other dates are cancelled one occurrence at a time
- A moved event needs only the pillar director's approval, with no executive step, and is approved straight away when there's no director. It can't be moved onto the time it gave up
- If the holder keeps it, the request goes back to the requester to pick another time. The same dates can't be asked for again
- No answer: a reminder after 3 days. After 6, the pillar director over the holder's committee decides for them, or the executive when there's no director. Nothing is ever given up automatically
- The rules are in `portal/src/lib/events/slot-requests.ts`

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
| Team queues | Marketing, AV, security, finance | Board and list of open tasks across all cards, filtered to the team | 2 |
| Marketing requests | Everyone submits; the marketing team reviews weekly | Marketing work not tied to an event: graphic design, physical signage, announcements, highlights, new webpages, small website updates, custom short links or redirects, staff badges, and anything else. Each type asks its branch of today's form. Weekly review → scheduled with a done-by date → in progress → done, or a question back to the requester, or declined. Event marketing and event A/V stay on the event card | 2 |
| Daily run sheet | Security, facilities, office | One printable page per day and campus: time, room, event, contact, setup, security notes, after-hours flag | 2 |
| Event close-out | Card owner; finance | Attendance, actual spend from linked purchase requests vs. budget, room condition from security, deposit refund | 2 |
| Library | Everyone signed in; each drive shows only to its group | Home for Shura documentation, policies, minutes and other files, kept in IAR-owned shared drives. Browse by team, search across everything the person can open, tag and categorize, policy owners and review dates, links from cards to the files they rely on. See the Library section | 2 |
| Facility rentals (gym) | Public front door; office reviews | Outside renters book without an IAR account (email verified). Fee, deposit, agreement, and an insurance upload if the policy requires it. Same approval engine | 3 |
| Public calendar feed | Public | Approved public events published to the website and to Salam Y'all | 3 |
| IT & Maintenance tickets | Everyone submits; IT and facilities teams work their queues | One AV/IT/Maintenance request for anything broken or needed: which team, the room and, optionally, a piece of equipment; urgency; photo. New → assigned → in progress → waiting on parts → resolved, with the reporter notified. Facilities is a paid team that works in Jira today; this module brings that work into the portal so requesters can see how their request is progressing | 2 |
| Asset tracker | Facilities, IT, office | Tagged equipment with location, cost, warranty and serial; repair history from tickets; portable items checked out to a committee or event and checked back in; warranty-ending alerts | 2 |
| Budget | Chairs (their cost centers), finance, executive, Shura (read) | Built on the FY2026–27 budget (July 1–June 30): IAR General Fund cost centers plus the Page Road campus. Sankey of funding source → cost center → spent, committed, available, with a table. A Revenue tab sorts everything received into three kinds: **unrestricted gifts** to IAR (General Fund), **designated donations** to a committee (e.g. Da'wah) and **program revenue** earned by a committee (e.g. Youth); Page Road tracks tuition, endowment and donations against its plan. Finance imports a QuickBooks export (CSV now, QuickBooks Online connection later); rows are sorted by account and class, and anything without a committee waits for finance to assign it. Expense rows are matched to purchase requests | 3 |
| Shura / Board dashboard | Shura / board members (team group `portal-team-shura@`) | Organizational health at a glance, counted live from the other modules: events in the next 30 days (and expected attendance, items awaiting review, open close-outs), maintenance cases by kind (repair, preventive, improvement) and IT cases, with late and urgent counts and preventive schedules kept on time; purchase requests in progress and how long they wait; community care as totals only; a short money summary (General Fund cushion, received and spent against the year, committees ahead of pace). A "Needs the Shura" list gathers mission reviews, capital projects, policy drafts and overdue policy reviews, and open Shura requests; a key-dates list covers insurance, inspections, the books review and the annual meeting. Money detail lives in Budget (a Year to date tab), not here. Shura members can send requests: a report from finance, a budget amendment or a spending review from the executive. Approved amendments are applied in QuickBooks and re-imported | 3 |
| Later | By group | Onboarding/offboarding checklist (groups, cards, keys, Drive), key checkout, volunteer signup, event templates | 4+ |

## Library

**Decided (Oct 20, 2026):** the portal is also the home for IAR's documents, not only for files attached to cards. It starts with Shura documentation and policies and grows from there. Files live in Google shared drives owned by IAR; the portal is the way in, not a second copy.

**Principle: Drive enforces access, the portal presents it.** A Google Group can be a member of a shared drive with a role, so the groups that already decide which portal modules a person sees can also decide which drives they can open. The portal calls Drive with the signed-in user's own token, so browse and search only return what that person can already open. The portal keeps no file permissions of its own to get wrong.

| Shared drive | Who has access (group → role) | Contents |
| --- | --- | --- |
| IAR Shura | `portal-team-shura@` → Content manager or Viewer by need | Minutes, resolutions, board packets, budget approvals |
| IAR Social & Welfare | `portal-team-social-welfare@` → Contributor; a few named managers | Case files and aid records. Most restricted drive |
| IAR Policies | All staff group → Viewer; Shura and executive → Contributor | Approved policies: rooms, purchasing, rentals, volunteer, HR |
| IAR Finance | `portal-role-finance@` → Content manager | Receipts, W-9s, invoices, QuickBooks exports |
| IAR Operations (and per-team drives if needed) | Each team's group → Contributor | Run sheets, contracts, event files, templates |

Exact drives and role levels are open (see questions below).

**Setup in the Workspace admin console**
- Add each group as a drive member with its role (Drive API: `permissions.create`, type `group`, `supportsAllDrives=true`). Nested groups work.
- On restricted drives, allow access to members only and turn off sharing to non-members and link sharing. Give Manager to the IAR super admin and one backup admin only, since Managers can change membership.
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
- Reusing `portal-team-shura@` for both the Shura module and the Shura drive keeps one place to manage membership. If someone ever needs the module without the documents, split into a second group.

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
| Conflicts: the two chairs agree first, then the CEO's decision is binding | The requester asks the holder to give up the time (see "Asking for a booked time"). No answer in 6 days: the holder's pillar director decides, or the executive when there's no director | Workflow |
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
- [ ] **Mission review:** written criteria, and how long the director and the executive each have
- [ ] **Lead times:** the policy has none. Marketing asks for 3 weeks. Set a minimum per event type
- [ ] **Room conflicts:** replace "the CEO's decision is binding" with the portal's flow: the requester asks the holder, who gives the time up or keeps it; no answer in 6 days goes to the holder's pillar director, or the executive when there's none; a moved event needs only the director's approval
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
| Line item, vendor, account | Line items split across sub-accounts, saved vendors with W-9 status (`portal/src/lib/purchases/types.ts`) |
| Comment, attachment, audit log | Every change, who made it and when; files kept in the Shared Drive |

**Groups** (see "Committees and teams" below, and `docs/setup.md` §6): one `portal-team-*` group per committee or team, one `portal-pillar-*` group per director, and the role groups `portal-role-office`, `-finance`, `-executive`, `-admin` and `-beta` (the testers). Each restricted group that also guards a shared drive (Shura, Social & Welfare, Finance) is added to that drive as a member; see the Library section.

## Roadmap

Phase 1 replaces the two forms that hurt the most. Each later phase waits on a sign-off rather than a date, because the office and Shura decisions set the pace.

| Phase | Scope | Gate to start the next phase |
| --- | --- | --- |
| 0 · Groundwork | Repo and hosting, service account, access groups, room list with calendar IDs, rules list drafted with the office | Office signs off the rules list and approvers |
| 1 · Shell, Purchase Requests, Event cards | Sign-in, My Requests, PO module, event cards with calendar holds and rule flags. Phase 1 also brought in phase 2's queues, run sheet, close-out and marketing requests, and IT & Maintenance; piloted with a small group of testers, now live for everyone. Purchase requests stay a demo until finance is ready | Live; old Program Request form retired, Requisition form retired once purchase requests go live |
| 2 · Team queues, run sheet, close-out, Library | Marketing, AV, facilities, security queues; daily printable run sheet; close-out with actual spend; Marketing form retired; Library with the Shura and Policies drives | Shura approves the refreshed room policy, including rental terms |
| 3 · Gym rentals, public calendar | Public front door for outside renters; approved events fed to the website and Salam Y'all | A full Ramadan run on the portal |
| 4 · More modules, other masjids | Maintenance, onboarding/offboarding, budget vs. actual, keys and assets; second org on the same settings model | — |

Purchase Requests and Event cards share the shell, so building them together costs little more than building one.

## Risks, open questions and next steps

The biggest risk is people, not code. The portal only works if every booking goes through it and the office uses it instead of email.

| Risk | Mitigation |
| --- | --- |
| Bookings still made outside the calendar | The portal is the only way to book. The office stops confirming by email once the pilot ends |
| Office or teams keep working from email | Their queue is the only place approvals happen. Chat alerts link straight to the card |
| Too many alerts, as with the current PO form | Chat alerts only go to whoever must act; a weekday morning digest; everything else stays in the portal's notifications |
| Mission review turns into gatekeeping or a bottleneck | Shura-approved criteria, any executive can give the final approval, a time limit for each reviewer |
| One builder holds all the knowledge | Repo owned by IAR, written setup guide, admin role held by a group, not a person |
| Scope creep before Phase 1 ships | Phase 1 is only the shell, POs and event cards. Everything else waits for its gate |

**Open questions**

- [ ] Who approves events today, and does it vary by room or campus?
- [x] Is IAR's calendar one shared calendar, or one per room? One per room: IAR already has a room resource and calendar for each
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
- [x] Google Cloud project, Firestore, OAuth client and domain-wide delegation: run `go-live` (`ops/go-live/`, `docs/launch.md`)
- [x] Purchase Requests module on the shell
- [x] Portal-wide notifications (bell plus a Google Chat message to whoever acts next, email as the fallback), search by request number or words, a feedback button on every page, with replies, and out-of-office handoff of approvals
- [ ] Set up the IAR Portal Chat app, its spaces, and the portal mailbox (go-live steps 3 and 6)
- [x] Event cards with calendar holds and rule flags, and asking for a booked time
- [x] Marketing Requests, Team Queues, the daily run sheet, event close-out and IT & Maintenance (with a one-time Jira import), built ahead of their phases
- [x] The daily job: purchase reminders and morning digest, ask reminders and escalation, close-out, preventive maintenance
- [x] `go-live`: one command that sets up Workspace and Cloud after showing every change, and the members template
- [ ] Office fills in the members Sheet; go-live creates the groups and service accounts
- [ ] Office checks the room list against IAR's room resources; go-live shares the room calendars with the portal
- [ ] Review the rules table and approvers with the office
- [ ] Draft the policy refresh for the Shura
- [ ] Create the shared drives and add the access groups as members (Library)
- [x] The Library module, starting with IAR's policies (the rest of the drives come later)

## Recurring reservations (proposed)

- Every reservation has an end date. There is no open-ended option.
- The requester picks the end date, but it can be no more than 3 months after the first date (Portal Settings can raise the limit to 6). Longer needs are met by renewing.
- Each session is checked against the calendar; conflicts list how many dates clash.
- Renewal: a committee may request its next period no earlier than 30 days before the current end date (adjustable). The renewal starts after the current series ends and goes through normal approval.
- In production, school hours, prayers, Jumuah and the food pantry come from the IAR Google Calendar, so the standing-hold rules above are demo-only.

## Committees and teams

Committees and teams work the same way: each is a Google Group, everyone belongs to at least one, and a person requests events, marketing and purchases for their own committees and teams, plus any committee they direct. The list for the initial launch:

Administration · Al-Furqan School · Al-Iman School · An-Noor School · Cemetery · Cleaning · Construction · Da'wah · Education · Events Committee · Facility Maintenance · Fundraising · Health & Wellness · IAR Cafe · Imam Office · IT Services · Marketing · Older Adult Community · Page Road · Safety & Security · Shura · Social & Welfare · Sports & Recreation · Volunteer · Women's Committee · Youth

Budget and financial reporting are not part of the initial launch, so this list doesn't follow the budget's cost centers (which combine Marketing & Fundraising, for example). Matching committees to budget lines is left for when Budget is designed.

**Nobody edits code or files to assign people.** Everything about people is set in Google Admin → Groups. The two remaining choices, which fund each team charges and IAR's cards, are made in Portal Settings.

- **One group per team** (`portal-team-<slug>@`; for example "Women's Committee" → `portal-team-women@`). In the group:
  - The **Owner is the chair**. Several Owners are co-chairs, and any of them can approve.
  - A **Manager is the vice chair**: the backup approver when the chair submits or is away.
  - **Members** are members.
- **Roles are per team.** A chair role never carries over to another team: someone can chair Youth and be a plain member of Education. Each request belongs to one committee, picked when submitting, and only that committee's chairs, vice chair or director act on it.
- **Approval order** for a committee's request:
  1. its chair; if the requester is a chair, another chair
  2. the vice chair
  3. the director
  4. finance review

  Nobody approves their own request.
- **Directors.** Each pillar is a group (`portal-pillar-<slug>@`). Its Owner is the director, and its members are the team groups it covers.
  - A director sees those committees' requests and can approve at the chair step alongside the chair, recorded "as director".
  - They can submit for those committees.
  - They never act on Social & Welfare's restricted requests, their own requests, or finance, payment or executive steps.
- **Role groups** (`portal-role-<job>@`): office, finance, admin and beta (the testers, "Portal: Testers"). The executive group holds whoever has an executive office (Head Imam, Shura chair, CEO). One person can hold several, and nothing about the offices is in code.
- **Queues come from teams.** Being on Marketing, IT Services (which includes A/V), Facility Maintenance, Safety & Security, Social & Welfare or Shura gives that team's queue or module.
- **Funds.** Members charge their own teams' funds; the office and finance can charge any fund. Each team's fund is set in Portal Settings, which suggests one when the names match.

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

## Purchase Requests: what the old form showed

From the PO response sheet, Oct 16, 2025 to Oct 16, 2026 (11,000 responses since Feb 2019). The current form handles about 1,250 requests and $3.5M a year, and approvals are usually fast; the trouble is the slow tail, an unused split feature, and an inconsistent chart of accounts.

| Finding | Number | What it means for the design |
| --- | --- | --- |
| Volume | 1,257 requests, $3.46M; median $637 | Steady, modest load; the portal handles this easily |
| Social & Welfare | 447 requests (36%), $1.67M (48%) | Mostly aid paid to individuals. Give it its own request type with visibility limited to S&W and finance, since payees are aid recipients |
| Split across sub-accounts | 23 of 2,585 requests in 24 months used more than one line (0.9%) | The feature exists but is too awkward to use; one-line requests likely hide mixed spending |
| Card receipts | 100 submissions, about 8 a month for ~12 cards | Not every card is reconciled monthly; the card checklist will show which |
| Approval speed | Median 0.8 days end to end; 90% within 4.3 days; 6% over a week | The average is fine; the overdue flag and escalation target the slow 6% |
| Open right now | 17 in progress from the last year, 12 of them waiting 7 to 44 days; 1 marked "more info requested" for 297 days; 14 from 2019–2022 never closed | Direct evidence of requests stuck without an owner |
| Approval route | Chair (23 different approvers) → accounting → copy to PO; no amount-based step | 167 requests a year are over $2,500 and 93 over $5,000, which helps set an executive threshold if one is wanted |
| Check delivery | 5 standard choices, plus about 50 typed variations of "leave it with security" | Add "Leave with the security office" as a standard choice |
| Chart of accounts | 24 funds, 97 sub-accounts; 27 have no number; 56000 and 50300 each reused in 7 funds; a revenue account (04-4001) sits on the expense list | An account must be identified by fund plus account, not number alone. A ready agenda for the meeting with the bookkeeper |

Files: receipts go to the PO records Shared Drive, one folder per fiscal year; W-9s only to the restricted W-9 drive, never the database or email. Keep 7 years after the fiscal year closes, with the office deleting the aged-out year by hand (IAR's accountant should confirm the period).
