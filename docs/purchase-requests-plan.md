# IAR Purchase Request (PO) System — Plan & MVP

Oct 16, 2026 · @Kashif

> Purchase Requests is now one module of the IAR Internal Tools Portal — see [plan.md](plan.md). The platform recommendation below (Apps Script + Sheet) is superseded by that plan's Architecture section; the rest of this design carries over.

## Summary

Recommendation: replace the three Google Forms and Form Approvals with a small custom web app built on IAR's own Google Workspace (Apps Script + a Google Sheet as the database + a Shared Drive for files), built with Claude Code. It costs $0 in software, removes the Form Approvals subscription, and fixes every problem on the list because everything is owned by the organization rather than a person.

The core idea is one request record that moves through clear statuses, with a single dashboard the office checks instead of an inbox. Requesters split one request across as many sub-accounts as they need, picking each from a list. Vendors and their W-9s are stored once and reused.

The MVP delivered with this plan is a clickable prototype of the three screens (new request, admin dashboard, vendor/W-9 registry) using sample data. It is for walking the office and the Shura through the workflow before anything is built; it stores nothing real.

## Problems today and their root causes

Most of the pain traces back to two things: Google Forms stores uploads in one person's My Drive, and email is being used as the tracking system.

| Problem | What actually causes it | How the new system fixes it |
| --- | --- | --- |
| Inbox clutter and confusing notifications | Every form submission and every Form Approvals step sends its own email to shared inboxes | One dashboard is the source of truth; approvers get one short email (or a daily digest) with a direct link to their queue |
| Missed approvals (e.g., the marketing contractor PO last week) | Approval requests land in the shared office inbox, where nobody owns them | Each request has a named current approver and an age counter; anything waiting over 3 days is flagged red and escalated automatically |
| Storage limits | A form's uploads count against the owner's Drive, and each form has a total-upload cap (1 GB by default) | Files go straight into a Shared Drive owned by IAR, filed by fiscal year; there is no per-form cap |
| Ownership and access (Br. Malik's departure) | Google Forms cannot save uploads to a Shared Drive, so file-upload forms are always owned by an individual account ([Jotform](https://www.jotform.com/google-forms/how-to-add-upload-button-in-google-form/)) | App, data and files all live under the PO account and a Shared Drive; people come and go through group membership |
| Splitting across sub-accounts | The form has one sub-account question per committee (about 35 columns) plus a fixed Amount 1–6 grid, so people choose a category and then type codes from memory | Line items: add as many lines as needed, each with an amount and a sub-account picked from a list filtered to that committee; the total checks itself |
| W-9 re-requests | W-9 is collected per request, not per vendor | A vendor registry: each payee's W-9 is stored once, in a restricted folder, and the form shows "W-9 on file" automatically |

Note on storage: the per-form cap can be raised to as much as 1 TB in the form settings ([Orbit Forms](https://orbitforms.ai/blog/google-forms-upload-file)), which is a quick stopgap if the current form fills up again before the new system is live. It does not fix ownership.

## What the response sheet shows

The current form handles about 1,250 requests and $3.5M a year, and approvals are usually fast; the trouble is the slow tail, an unused split feature, and an inconsistent chart of accounts. Figures cover Oct 16, 2025 to Oct 16, 2026 unless noted, from the PO response sheet (11,000 responses since Feb 2019).

| Finding | Number | What it means for the design |
| --- | --- | --- |
| Volume | 1,257 requests, $3.46M; median $637 | Steady, modest load; Apps Script and a Sheet handle this easily |
| Social & Welfare | 447 requests (36%), $1.67M (48%) | Mostly aid paid to individuals. Give it its own request type with visibility limited to S&W and finance, since payees are aid recipients |
| Split across sub-accounts | 23 of 2,585 requests in 24 months used more than one line (0.9%) | The feature exists but is too awkward to use; one-line requests likely hide mixed spending |
| Card receipts | 100 submissions, about 8 a month for ~12 cards | Not every card is reconciled monthly; the card checklist will show which |
| Approval speed | Median 0.8 days end to end; 90% within 4.3 days; 6% over a week | The average is fine; the overdue flag and escalation target the slow 6% |
| Open right now | 17 in progress from the last year, 12 of them waiting 7 to 44 days; 1 marked "more info requested" for 297 days; 14 from 2019–2022 never closed | Direct evidence of requests stuck without an owner |
| Approval route | Chair (23 different approvers) → accounting → copy to PO; no amount-based step | 167 requests a year are over $2,500 and 93 over $5,000, which helps set an executive threshold if one is wanted |
| Check delivery | 5 standard choices, plus about 50 typed variations of "leave it with security" | Add "Leave with the security office" as a standard choice |
| Chart of accounts | 24 funds, 97 sub-accounts; 27 have no number; 56000 and 50300 each reused in 7 funds; a revenue account (04-4001) sits on the expense list | An account must be identified by fund plus account, not number alone. A ready agenda for the meeting with Sr. Joani |

Correction: 01-5003 is General Fund Administrative Expenses and 01-5005 is Property Taxes & Insurance; General Fund cleaning supplies is 01-5009. The first prototype had these wrong; it now uses the real list.

## Requirements

The five goals from the office, plus what the current form already does that must not be lost.

**From the office's request**

1. Move off Google Forms (and Form Approvals).
2. One place to see every request and its status: pending approval, approved but not paid, complete.
3. Keep a separate copy of every attachment for at least 5 years, ideally 7, without cluttering Drive. QuickBooks keeps its own copy.
4. Split one request across multiple sub-accounts, chosen from a list.
5. Ownership tied to an organizational account, not a person.

**Carried over from the current form**

- Requester name and email, committee, and whether the requester is the committee chair
- Payee ("Issue check to"), mailing address, and how the check is delivered
- Labor flag and first-time vendor flag, which drive the W-9 requirement
- Description, invoice number, receipts, comments
- Electronic signature attestation and typed name
- Request number, overall status, current approver, chair approval status

**Added**

- Vendor registry with W-9 stored once per payee
- Payment method and check/ACH reference recorded when the office pays
- "Entered in QuickBooks" checkbox, so the office can see what is reconciled
- An audit log on every request: who did what, when
- Chart of accounts kept in an editable sheet tab, so the update with Sr. Joani is a data change, not a rebuild

## Platform options

Recommendation: a custom Apps Script app inside IAR's Google Workspace. It is the only option that is free, keeps data inside the account IAR already controls, and fits the split-line and W-9 registry needs exactly. AppSheet is the fallback if nobody will maintain code.

| Option | Software cost | Org ownership | Split across sub-accounts | One dashboard | W-9 registry | Who maintains it | Main risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Apps Script web app + Sheet + Shared Drive (recommended)** | $0 | Yes: runs as the PO account; files in a Shared Drive | Yes, unlimited lines with dropdowns | Yes | Yes | A volunteer with Claude Code; code kept in a repo | Needs one technical owner and written handoff notes |
| AppSheet (no-code, Google) | $0 on Workspace for Nonprofits, which includes AppSheet Core ([Google](https://knowledge.workspace.google.com/admin/appsheet)) | Yes | Yes, via a child "line items" table | Yes | Yes | Office staff can edit it | Clunkier forms; approval logic gets messy as rules grow |
| Jotform with Approvals | Paid; nonprofits get 50% off Bronze/Silver/Gold ([Jotform](https://www.jotform.com/products/approvals/pricing/)) | Partly: standard plans are single-login accounts | Partly, with a configurable list widget | Partial | No | Office staff | Another subscription; data outside Google; per-plan upload limits |
| Ramp Procurement | Requires Ramp Plus plus the Procurement add-on ([Ramp](https://support.ramp.com/procurement-free-trial)) | Yes | Yes, with coding to QuickBooks | Yes | Yes, built-in vendor onboarding collects W-9s ([Ramp](https://community.ramp.com/t/accounts-payable-feature-roundup/193)) | Office staff | A whole new card and bill-pay platform; a bigger decision than this project |
| Replit app | Hosting fees | Only if the Replit account is org-owned | Yes | Yes | Yes | A developer | Data, files and logins live outside Workspace; adds a second system to secure |
| Keep Google Forms + Form Approvals | Current subscription | No for uploads | No | No | No | Office | Every current problem stays |

Why not Replit: it would work, but it moves sensitive payee data (W-9s carry SSNs and EINs) outside the Workspace account IAR already secures, and needs its own login system. Building in Apps Script with Claude Code gives the same flexibility while staff keep signing in with their IAR Google accounts.

Ramp is worth a separate look later as part of the broader finance stack (cards, bill pay, QuickBooks sync), but it should not block fixing the PO form now.

Since IAR also holds a Microsoft 365 license, the same design could instead be built on SharePoint Lists + Power Apps + Power Automate, with the same org-ownership and group-based access properties as the Apps Script option. Worth a short side-by-side once the Google Education tier is confirmed, but it shouldn't delay the plan — either stack supports the design in this document.

## Proposed design

Every request is one record with one status and one named person it is waiting on. Approvers act from a queue, not from email.

### Workflow and approvals

&#91;embedded content: approval flow · 6 steps, 1 optional\]

The dashed step applies only above the dollar limit; any approver can send a request back to the requester.

1. **Submitted.** Requester fills the form, adds line items and attachments. If the payee is new or the work is labor, a W-9 is required unless one is already on file.
2. **Chair approval.** Routed to the committee chair listed in the Committees tab. Skipped automatically when the requester is the chair.
3. **Finance review.** The office checks coding, receipts and W-9, and can fix a sub-account without sending the request back.
4. **Executive approval (only above a set amount).** The threshold and approver live in a Settings tab, so they can change without code.
5. **Approved, to pay.** The office pays and records method, date and check or ACH reference.
6. **Complete.** Marked once it is entered in QuickBooks.

At any approval step the approver can **Return** it (back to the requester with a note) or **Reject** it (closed, with a reason).

Notifications: one email per action, only to the next person; a single morning digest for anyone with items waiting; a reminder after 3 days and escalation to the office lead after 5. The requester hears only when it is returned, approved or paid.

### Where data lives

One Google Sheet in a Shared Drive is the database. Each tab is a table:

| Tab | One row per | Key fields |
| --- | --- | --- |
| Requests | request | Request #, date, requester, committee, payee, delivery method, description, invoice #, total, status, current approver, days waiting, paid date and reference, QuickBooks entered |
| LineItems | line on a request | Request #, sub-account code, amount, note |
| Vendors | payee | Name, mailing address, email, W-9 on file (yes/no), W-9 date, link to W-9 file, 1099 likely (yes/no) |
| Accounts | sub-account | Code (e.g., 01-5003), name, committee or fund, active |
| Committees | committee | Name, chair email, backup approver |
| AuditLog | action | Request #, who, what, when, note |
| Settings | setting | Executive-approval threshold, reminder days, office group email |

### Files and retention

- **PO records Shared Drive:** one folder per fiscal year, one subfolder per request (`FY2027 / PO-11045 Sports – Rabee Khan`) holding the invoice and receipts.
- **W-9 Shared Drive (restricted):** finance office only. W-9s contain SSNs or EINs, so they never go in the PO folders, the Sheet, or email.
- **Retention:** keep 7 years after the fiscal year closes. Each year, the office reviews and deletes the folder that has aged out, rather than relying on automatic deletion. IAR's accountant should confirm the period.
- Shared Drive storage draws on the organization's pooled Workspace storage, not any individual's.

### Ownership and access

- The script and Sheet are owned by the PO account and sit in a Shared Drive whose managers are the PO account plus at least two people (for example, the office lead and the treasurer).
- Access is granted to Google Groups (requesters, approvers, finance), never to individuals, so a departure is one group change.
- The source code is kept in a GitHub repository under an IAR organization account, with a one-page handoff note.
- In practice this gives three views of the same app, gated by Google group membership rather than separate logins: a **requester view** open to anyone with an IAR Google account — submit a request, and also see a "My requests" list of everything they've submitted with its status and current approver; a **chair view** unlocked for whoever is in a "PO Chairs" group (adding or removing a chair is a group edit, not a new account); and a **finance view** unlocked for the "PO Finance" group. All three sign in with SSO through the same IAR account they already use.
- **Social & Welfare gets a restricted variant of the dashboard and queue:** its payee names and line-item detail are visible only to the S&W chair and finance; everyone else sees that a request exists, its amount, and its status, not who received it.

## Credit card receipts

The same form handles receipts for IAR's roughly 12 credit cards, each assigned to one person, through a third request type. Today a card submission puts every charge in one text box with one total and one sub-account. A July example coded 17 charges (conferences, airfare, software, postage, certificate supplies) to Imam's Office Fund. Two pending refunds and a $300 repayment were tracked only in comments, and the listed amounts summed to $2,647.48 against $2,648.28 entered.

**How it works in the new system**

- A request type at the top of the form: *Pay a vendor or person*, *Reimburse me*, or *IAR credit card receipts*.
- Card receipts skip the payee, W-9 and check sections. The cardholder picks their card (last four digits) and statement month, and the committee fills in from the card.
- One line per charge: date, merchant, sub-account, amount, and its own receipt. Totals add themselves.
- Each line can be marked **Refund pending** or **To be repaid by** a named person or committee. These stay open on the dashboard until the office marks them received.
- Charges without a receipt are flagged, not blocked, so the office can chase them.
- Approval is an after-the-fact **card review** by the finance office, not chair or executive approval, since the money is already spent.

**Card registry.** A Cards tab in the Sheet (last four digits, cardholder, committee, active) drives the card dropdown and a monthly checklist. Any card with no receipts submitted for last month is flagged. Card numbers beyond the last four are never stored.

**Phase 2: statement import.** The office uploads each month's card statement export. Every cardholder then sees their charges pre-filled and only adds a sub-account and receipt to each. Nothing on the statement can be skipped, and the dashboard shows unreceipted charges per card.

## MVP

The MVP is in two stages: a clickable prototype now for sign-off, then a working pilot in Workspace.

**Stage 1: clickable prototype (delivered with this plan).** Three screens with sample data, nothing saved, no real names or tax IDs. It covers all three request types, including card receipts with refund and repayment tracking:

Open the prototype: [IAR Purchase Requests](https://claude.ai/artifact/RBKN5GrTWCqvFfDTqq5RzB). Try submitting a request with two lines, then approve, return, or mark it paid from the dashboard.

- **New request:** committee picker, payee lookup that shows "W-9 on file" for known vendors, line items with sub-account dropdowns filtered by committee, running total, attachments, attestation.
- **Admin dashboard:** counts by status, a queue with current approver and days waiting (overdue flagged), and a detail panel to approve, return, or mark paid.
- **Vendor registry:** payees with W-9 status and date.

The prototype uses IAR's real list of 24 funds and 97 sub-accounts from the response sheet; requests, vendors and cards in it are made up. In the built app the list lives in the Accounts tab.

**Stage 2: working pilot.** Built in Apps Script with Claude Code, scoped to what proves the model:

- [ ] Request form with line items, Accounts dropdowns, uploads to the Shared Drive
- [ ] Vendor registry with W-9 upload to the restricted drive
- [ ] Chair and finance approval with the dashboard queue, morning digest and 3-day reminder
- [ ] Mark paid and QuickBooks-entered
- [ ] Audit log
- [ ] Requester view: a "My requests" list filtered to the requester's own submissions, showing status and current approver

Out of the pilot: executive threshold step (added once the amount is set), QuickBooks integration, data migration of past responses.

## Rollout

About 10 weeks from kickoff to cutover, with the old form running alongside the pilot so nothing is lost.

&#91;embedded content: rollout · 5 phases, 2 gates, weeks from kickoff\]

The stopgaps in week 0 relieve the two most urgent problems (missed approvals and storage) while the new system is built.

## Open questions for the office

- [ ] What dollar amount needs approval above the committee chair and finance, and who gives it?
- [ ] Are the 23 chair approvers in the current setup still right? Name a backup approver for each
- [ ] With Sr. Joani: numbers for the 27 unnumbered sub-accounts, and how to tell apart 56000 and 50300 across funds (the app can launch on the current list)
- [ ] Resolved: everyone has an IAR email address, so the app can require sign-in with an IAR account throughout — no need to support personal Gmail anywhere, including card receipts and fund transfers.
- [ ] Should school sub-accounts (Al-Iman, An-Noor, Al-Furqan) stay on this form? The schools are separate legal entities, so their spending may belong in their own process, or at least be clearly tagged by entity.
- [ ] Resolved: Kashif is the super admin on both IAR's Google and Microsoft accounts. Google is on the Education plan (tier still to confirm — Fundamentals, Standard, or Plus) with Shared Drives included; whether AppSheet Core is included isn't confirmed yet. IAR also holds Microsoft 365. Being super admin is a configuration role, not ownership: the app, Sheet and Shared Drive must still be created under IAR's organizational PO account — not Kashif's personal Google or Microsoft account — so this doesn't become the same single-person dependency as Br. Malik's departure.
- [ ] When does the Form Approvals subscription renew?
- [ ] Who will be the technical owner after launch?

* [ ] Decided: Social & Welfare gets a restricted dashboard view (above), visible in full only to its chair and finance. Still to confirm with the accountant: does the W-9 rule apply to aid recipients?
* [ ] Close out or cancel the 14 requests from 2019–2022 still marked In progress, and the one waiting on more info for 297 days, so the new system starts clean
* [ ] Card list: the 12 cards' last four digits, cardholder and default fund

- [ ] "Fund transfer between funds within IAR" is a payment option today (7 in the last year). It is an internal journal entry, not a payment: give it its own simple request type (from fund, to fund, amount, reason) with finance-only approval?
- [ ] Should a chair's own request route automatically to the backup approver instead of skipping approval?
- [ ] Do we need a conflict-of-interest disclosure step for payments to Shura or committee members (or companies they control)?
- [ ] Should payments above the executive threshold require a second person to execute, separate from whoever approved?

Access needed to build: the three current forms and their response sheets (shared to an IAR account, not the Google account connected here), and a Shared Drive created under the PO account. Logging in to the PO email or Form Approvals is not needed for the prototype; for the build, the office should create the Shared Drives and add the builder as a manager rather than sharing the PO account password.
