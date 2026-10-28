# Website inquiries → IAR Portal: spec for the GoHighLevel developer

**Status:** draft for review · **Last updated:** 2026-10-28 · Live editable copy to share with the developer: [Claude doc](https://claude.ai/artifact/DK7jVZLCk8zbhVwfTnHgxk)

## What we're building

Visitors to the IAR website fill in a form (built in GoHighLevel). Each submission becomes an **inquiry ticket** in the IAR Portal (https://portal.islam1.org), the staff-only tool where IAR teams work requests. The portal puts each ticket in the right team's queue, alerts that team in Google Chat, and the team answers the person by email.

Your part is the GoHighLevel side: the forms, and a workflow that sends each submission to the portal. You don't build anything in the portal.

There are four forms:

| Form | `form` value | Goes to | `desk` value |
|---|---|---|---|
| Contact the Imam Office | `imam-office` | Imam Office | `imams` |
| Da'wah: visits, speakers, questions about Islam | `dawah` | Da'wah | `dawah` |
| Giving and donations | `fundraising` | Fundraising | `fundraising` |
| General contact ("Contact IAR") | `general` | Sorted by the portal | *(leave empty)* |

The general form has no fixed team. The portal sorts it from the visitor's topic choice, and anything it can't sort goes to a person who sorts it by hand. More forms and teams may come later: each is one more `form` value, with no change to the payload.

Requesters never sign into the portal and never see it. All intake happens on the website.

## How submissions reach the portal

**Main path: a webhook.** One GoHighLevel workflow per form (or one shared workflow branching on the form), triggered by *Form Submitted*, with a **Custom Webhook** action that POSTs JSON to the portal.

**Backup: an email copy.** The same workflow also sends a plain email copy of the submission to `inquiries@islam1.org`. If the webhook ever fails, nothing is lost. The portal ignores this copy while the webhook works. See "Email-only option" below if the webhook can't be used.

Please don't send email confirmations to the visitor from GoHighLevel. The portal sends them, with the ticket's reference number (for example "IN-1042"). The on-page thank-you message is yours to set (wording below).

### Endpoint

```
POST https://portal.islam1.org/api/intake/ghl
Content-Type: application/json
Authorization: Bearer <intake key>
```

- **The intake key** is a long random string the IAR admin gives you privately, in person or by password manager, never by email or chat. It goes only in the webhook action's header. Never put it in the URL, a form field, or page code.
- Use HTTPS only. The body must be under 100 KB (attachments are sent as links, not files).

### Payload

```json
{
  "version": 1,
  "test": false,
  "form": "general",
  "desk": "",
  "topic": "Marriage (nikah)",
  "submission_id": "abc123-…",
  "submitted_at": "2026-10-28T14:03:00Z",
  "contact": {
    "ghl_contact_id": "x7Yk…",
    "first_name": "Aisha",
    "last_name": "Rahman",
    "email": "aisha@example.com",
    "phone": "+19195550100",
    "preferred_contact": "email"
  },
  "subject": "Nikah at IAR in December",
  "message": "Assalamu alaikum, we'd like to…",
  "answers": [
    { "label": "Preferred date", "value": "2026-12-19" },
    { "label": "Number of guests", "value": "40" }
  ],
  "attachments": [
    { "name": "letter.pdf", "url": "https://…" }
  ],
  "consent_to_contact": true,
  "page_url": "https://raleighmasjid.org/contact",
  "utm": { "source": "", "medium": "", "campaign": "" }
}
```

| Field | Required | Notes |
|---|---|---|
| `version` | yes | Always `1` for now |
| `test` | no | `true` checks the submission without saving it (see Testing) |
| `form` | yes | One of the `form` values in the table above |
| `desk` | no | Fixed on the three team forms (`imams`, `dawah`, `fundraising`); empty on the general form |
| `topic` | yes | The visitor's "What is this about?" answer, **exactly as shown on the form** (lists below) |
| `submission_id` | yes | A value that's unique per submission. Use the form submission ID if GoHighLevel exposes it; otherwise the contact ID plus the submission time. The portal uses it to ignore repeats |
| `submitted_at` | yes | ISO 8601, with a time zone |
| `contact.email` | yes | The portal replies here |
| `contact.first_name`, `last_name` | yes | |
| `contact.phone` | no | E.164 if possible |
| `contact.preferred_contact` | no | `email`, `phone` or `text` |
| `contact.ghl_contact_id` | yes | So IAR can find the person in GoHighLevel |
| `subject` | no | A short line if the form asks for one; the portal makes one from the topic otherwise |
| `message` | yes | The visitor's message, plain text, up to 5,000 characters |
| `answers` | no | Every other question on the form, as label/value pairs, in form order. Labels as shown to the visitor. New questions need no portal change |
| `attachments` | no | GoHighLevel's file-upload links. The portal copies each file into IAR's Google Drive. Up to 5 files, 10 MB each |
| `consent_to_contact` | no | The form's consent checkbox |
| `page_url`, `utm` | no | Where the visitor came from |

Merge field names differ between GoHighLevel accounts. Map each field to whatever your account calls it, and tell us the mapping.

Don't send anything else: no card numbers, no bank details, no ID documents. Donations stay in IAR's donation system; the Fundraising form takes questions about giving, not payments.

### Responses

| Status | Meaning | What GoHighLevel should do |
|---|---|---|
| `201 Created` | Ticket made. Body: `{ "reference": "IN-1042" }` | Nothing more |
| `200 OK` | Already received (same `submission_id`), or a test that passed. Body: `{ "reference": "IN-1042", "duplicate": true }` | Nothing more |
| `400 Bad Request` | Something's missing or wrong. Body: `{ "errors": ["contact.email is missing"] }` | Don't retry. Alert the IAR admin (below) |
| `401 Unauthorized` | Key missing or wrong | Don't retry. Alert the IAR admin |
| `429 Too Many Requests` | Too many from one email address (more than 5 an hour) | Don't retry |
| `5xx`, or no answer in 15 seconds | Portal problem | Retry up to 3 times (after 1, 5 and 30 minutes) if your workflow can; the email copy is the backstop |

**Alerting on failure:** if the webhook step fails, the workflow should send an internal email to `portal-role-admin@islam1.org` with the form, the submission time and the error. Don't include the visitor's message in that email.

### Topics ("What is this about?")

A dropdown on every form. Send the chosen label exactly as written. These lists are drafts: each team confirms its own before launch, and the final lists are kept in the portal's settings, so changing a label later means telling the IAR admin too.

**Imam Office:** Marriage (nikah) · Counseling or a personal matter · Becoming Muslim (shahada) · Funeral (janazah) arrangements · Religious question · Letter or verification · Something else

**Da'wah:** Visit or tour of the masjid · Request a speaker · Questions about Islam · Interfaith or community partnership · Support for new Muslims · Something else

**Fundraising:** Donation receipt or tax letter · Change or cancel a recurring donation · Zakat question · Pledge · Corporate matching or sponsorship · Wills and bequests · Something else

**General form:** every topic above (grouped under its team's name), plus: Programs and classes · Renting a space · Volunteering · Something is broken at the masjid · Something else / not sure

The general form sends just the label (for example "Zakat question"), not the group name.

### Form requirements

- **Spam protection:** turn on GoHighLevel's captcha on all four forms, and add a hidden honeypot field. If the honeypot is filled, don't call the webhook.
- **Required fields:** first name, last name, email, topic, message. Phone is optional.
- **Funerals:** on the Imam Office and general forms, show this above the form: "For a funeral today or tomorrow, please call the Imam Office at (number) instead of using this form." IAR gives you the number.
- **Consent line** near the submit button: "IAR staff will reply by email. Please don't include card numbers or other payment details."
- **Thank-you message:** "Thank you. We've received your message and will email you a reference number shortly. Most messages are answered within 2 working days."
- **Contact record:** create or update the GoHighLevel contact as usual and tag it `inquiry-<form>` (for example `inquiry-dawah`). Fundraising may ask for more tags and pipelines in GoHighLevel itself; that's separate from this spec.

### Testing

1. Build the forms and workflows with `"test": true` in the payload. The portal checks the payload, answers `200` with what it would have done (`{ "test": true, "desk": "dawah", "errors": [] }`), and saves nothing.
2. Send one test from each form, including a general-form submission for every topic. Share the results with the IAR admin.
3. When the admin confirms, set `"test": false`. The admin then sends one real submission per form and checks it reaches the right queue.

## Email-only option

Use this only if the Custom Webhook action isn't available on IAR's GoHighLevel plan. The portal then reads a mailbox instead of receiving a webhook: slower (checked every 5 minutes) and less robust, but it works.

- **To:** `inquiries@islam1.org`
- **Subject:** `IAR inquiry: <form> — <subject or topic>`
- **Body:** plain text, with the same JSON payload as above between these two lines, nothing else between them:

```
---BEGIN IAR INTAKE---
{ …the JSON payload… }
---END IAR INTAKE---
```

The intake key goes in the JSON as `"key": "<intake key>"`, since email has no headers you can set. Anything outside the markers (a readable version for people, for example) is ignored. Emails without a valid block are flagged for the IAR admin, not lost.

## Later (not needed for launch)

- **Updates back to GoHighLevel:** when a ticket is answered or closed, the portal adds a note and a tag (`inquiry-answered`) to the contact through the GoHighLevel API, so Fundraising sees the history on the donor's record. This needs a GoHighLevel private integration token for the portal; IAR will ask when it's built.

## What we need from you

1. Confirm the Custom Webhook action is available (or that we need the email-only option).
2. Your merge field mapping for every payload field, and how you'll make `submission_id`.
3. A test run from each form, as above.
4. Anything in this spec that doesn't fit how GoHighLevel works.
