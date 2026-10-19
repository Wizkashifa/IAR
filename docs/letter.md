# Introducing IAR Purchase Requests

Oct 16, 2026 · @Kashif

Assalamu alaikum,

This is a proposed replacement of the Requisition Form with a new system called **IAR Purchase Requests**. It is one place to request payments, get reimbursed, and submit credit card receipts, with a dashboard that shows where every request stands. This letter explains why the change is needed, what this year's records show, and what the new system does differently.

*This is a demo to show what's possible and ground our discussion — nothing here is built or adopted yet. The a**dmin** and finance office will review this together and decide on the approach before any system changes.*

## What isn't working

The Requisition Form has served IAR since 2019 and has processed more than 10,000 requests. It was built for simple check requests, and the ways we now use it have outgrown it.

- **Approvals get lost in email.** Approval requests and notifications go to shared inboxes, where they pile up and nobody clearly owns them. A marketing contractor's request was missed last week.
- **Files depend on individual accounts.** Google Forms saves uploads to the form owner's personal Drive. When Br. Malik left, the office temporarily lost access to receipts and invoices until ownership was moved. One form has already hit its storage limit and had to be moved to keep working.
- **Splitting a purchase across sub-accounts is hard.** Requesters pick one category, move to another page, and type account codes from memory.
- **Credit card receipts don't fit.** Cardholders type "IAR Credit Card" in the "Issue Check to" box and must still enter a mailing address. All their charges go into one text box with one total.
- **The form is fragile.** It spans several pages and warns that using the browser's back button erases everything entered.
- **We pay for Form Approvals** to add an approval step on top of the form.

## What the 2026 records show

From January 1 to October 16, 2026, the form handled **966 requests totaling about $3.0 million**. Social & Welfare accounts for 345 of those requests and $1.53 million. Most requests are approved quickly: chairs typically respond within 1.5 hours and accounting within 6 hours. The problems sit in the exceptions, and they add up.

| Issue | 2026 so far |
| --- | --- |
| Requests that took more than a week to complete | 59, including 26 over two weeks; the longest took 141 days |
| Requests open right now | 17, worth $15,198; 12 have waited a week or more, the oldest 45 days |
| Where open requests are waiting | 14 of the 17 are waiting on a committee chair |
| Requests split across more than one sub-account | 10 of 966 (1%) |
| Requests coded to a sub-account with no account number | 430 (45%) |
| Requests coded to "56000 Program Expenses," a number used in seven funds | 103 |
| Requests with no sub-account recorded | 31 |
| Credit card submissions | 71, between 3 and 13 a month across about 12 cards |
| Delivery instructions typed in instead of chosen | 43 |
| Requests from 2019–2022 still marked "In progress" | 14 |

Three conclusions follow:

- First, stalled requests have no owner and nothing alerts anyone when one stops moving.
- Second, our spending detail is weaker than it looks: almost every request is coded to a single sub-account, and nearly half to accounts without numbers, which makes fund-level reporting and the upcoming chart of accounts review harder.
- Third, credit card spending is the least documented, since charges, pending refunds and amounts owed back to IAR live in free-text notes.

## The new system: IAR Purchase Requests

IAR Purchase Requests is a new system, not an updated form. It runs inside IAR's own Google Workspace, under an organizational account, at no software cost, and it replaces Form Approvals. You can try a working preview with sample requests here: [IAR Purchase Requests prototype](https://claude.ai/artifact/RBKN5GrTWCqvFfDTqq5RzB).

&#91;embedded content: approval flow · 6 steps, one return path\]

A request waits on one named person at a time, and any approver can return it for changes rather than letting it sit.

One design question for us to settle as a team: today's flow approves a request after it's submitted. An ideal system would make this a true purchase order — items get approved *before* money is spent, not after — so spending can't exceed what's approved and waste gets caught up front rather than during reconciliation.

**For requesters**

- Start by choosing what you need: pay a vendor or person, reimburse yourself, or submit credit card receipts.
- Everything is on one page. Add a line for each purchase and pick its sub-account from a list for your fund. The total adds itself.
- Saved vendors fill in automatically and show whether their W-9 is already on file, so you only send it once.
- A mailing address is asked for only when a check will be mailed. "Leave with the security office" is now a standard choice.

**For cardholders**

- Pick your card and statement month, then enter each charge with its own sub-account and receipt.
- Mark charges that will be refunded or repaid, and by whom. The office tracks them until the money comes back.

**For chairs and approvers**

- You get one short email with a link to your queue, not a stream of notifications.
- Anything waiting three days gets a reminder; anything waiting five days goes to the office lead.

**For the finance office**

- One dashboard shows every request, who it is waiting on, and for how long.
- Payments, QuickBooks entry, refunds and repayments are recorded on the request itself, with a full history.
- Receipts and invoices are filed by fiscal year in an IAR-owned Shared Drive and kept for seven years. W-9s are kept once per vendor in a restricted drive that only finance can open.
- Funds and sub-accounts come from a list the office maintains, so the chart of accounts update with Sr. Joani is a list change, not a rebuild.
- Access is granted to groups, not individuals, so nothing breaks when someone leaves.

## Next steps

We plan to move over in about ten weeks, with no gap in service:

1. **Now:** route approvals to named people instead of the office inbox, and close out the 14 requests from 2019–2022 still marked open.
2. **Weeks 1–2:** review the new system with the finance office and confirm funds, chairs and approval rules.
3. **Weeks 3–5:** build it.
4. **Weeks 6–9:** pilot with two or three committees while everyone else keeps using the Requisition Form.
5. **Week 10:** switch everyone over, retire the Requisition Form, and cancel Form Approvals at renewal.

To get started we need a few decisions: the dollar amount, if any, that should require approval beyond the chair and finance; a backup approver for each committee; and a list of the 12 IAR cards with their cardholders. Committee chairs will receive a short guide before the pilot.

Jazakum Allahu khairan for your patience with the current process and your help making the new one work. Please send questions or suggestions to me or the finance office.

Wassalam,

Kashif Osman
