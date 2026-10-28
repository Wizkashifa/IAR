/**
 * Help inside the portal: the short "How this works" box at the top of each
 * page (components/HelpBox.tsx) and the fuller guides at /help. Plain data, in
 * plain words for volunteers. People are named by their role ("the committee's
 * chair"), never by name: this repo is public.
 */

export type HelpKey = "events" | "purchases" | "marketing" | "it-maintenance" | "requests" | "away" | "teams";

export type HelpSection = { heading: string; steps: string[] };

export type HelpGuide = {
  key: HelpKey;
  title: string;
  /** One line for the help index. */
  summary: string;
  /** The page the guide is about. */
  href: string;
  /** The portal module (lib/modules.ts) a person needs to see it, if any. */
  module?: string;
  /** 3 to 5 short steps for the box at the top of the page. */
  short: string[];
  /** The full guide at /help/[key]. */
  sections: HelpSection[];
};

export const HELP_GUIDES: HelpGuide[] = [
  {
    key: "events",
    title: "Events and rooms",
    summary: "Request a program or event, book its room, and close it out afterwards.",
    href: "/events",
    module: "events",
    short: [
      "Click New event request and fill in one form: the event, the room, and marketing's and A/V's questions if you need them.",
      "The checks beside the form compare your times with the IAR room calendars as you type, so you see a clash before you send.",
      "Your committee's director reviews it, then an executive gives final approval. The room is held on the calendar while you wait.",
      "Once it's approved, marketing, A/V and security each get their task. After the event, you add the attendance and final costs.",
    ],
    sections: [
      {
        heading: "Ask for an event",
        steps: [
          "Open Events & Rooms and click New event request.",
          "Give it a title and a few sentences about what happens and who it's for. Reviewers approve faster when they can picture it.",
          "Pick the committee, the date, the start and end times, and how long you need to set up and clean up. Your committee sets up and cleans up its own events, and that time is held on the calendar too.",
          "Pick one or more rooms. The rooms your committee books most are at the top.",
          "Tick what applies: food, open to the public, registration, A/V, an outside speaker, a new program, a fundraiser.",
          "If it's open to the public, answer marketing's questions: a short subtitle, the announcement text and when marketing should start. Marketing asks for about 3 weeks before a public event.",
          "If you need A/V, say what kind of support and what the event includes.",
          "Read the room reservation policy, tick the boxes under Confirm and send it.",
        ],
      },
      {
        heading: "The checks",
        steps: [
          "As you fill in the form, the Checks panel compares your times with the IAR room calendars, school hours, prayers and the room rules.",
          "A red check means the room is taken or a rule is broken. Change the time or the room before you send.",
          "A yellow check is something reviewers will look at, such as a short lead time. You can still send it.",
          "If the time you want is already booked, you can ask whoever holds it to give it up. If nobody answers within a few days, their director decides.",
        ],
      },
      {
        heading: "Approval",
        steps: [
          "Your committee's director reviews it against IAR's mission. Then any executive can give the final approval.",
          "If a reviewer sends it back, you'll get a message saying what to change. Edit it and send it again from the request page.",
          "Once it's approved, the room is confirmed on the IAR calendar, and marketing, A/V and security see their tasks in Team Queues.",
        ],
      },
      {
        heading: "Repeating events",
        steps: [
          "Choose how often it repeats and pick an end date. A series can run up to 3 months at a time.",
          "When the series is within 30 days of its end, a Renew button on the request page starts the next period with everything filled in.",
        ],
      },
      {
        heading: "After the event",
        steps: [
          "The request page asks you to close it out: how many people came, how it went, and the final costs.",
          "Payment requests linked to the event count towards its budget, so the final costs are mostly filled in for you.",
        ],
      },
      {
        heading: "Drafts",
        steps: [
          "The form keeps what you've typed in this browser. If you leave and come back, click Pick up where you left off.",
        ],
      },
    ],
  },
  {
    key: "purchases",
    title: "Payments",
    summary: "Pay a vendor, get reimbursed, or send IAR credit card receipts.",
    href: "/purchases",
    module: "purchase-requests",
    short: [
      "Click New payment request and choose what it's for: pay a vendor or person, reimburse yourself, or IAR credit card receipts.",
      "Add a line for each sub-account it's charged to, and attach a receipt or invoice. On a phone you can take a photo.",
      "Your committee's chair approves it (the director, if you're the chair), then the finance office reviews it. Large amounts also need an executive.",
      "You'll get a message when it's paid, or if anyone sends it back with a question.",
    ],
    sections: [
      {
        heading: "Send a payment request",
        steps: [
          "Open Payments and click New payment request.",
          "Choose what it's for: pay a vendor or person, reimburse me, or IAR credit card receipts.",
          "Pick the vendor from the saved list, or add a new one. Saved vendors are shared by every committee.",
          "Add a line for each sub-account it's charged to, with the amount and a short note.",
          "Attach the receipt or invoice for each line. Every request needs at least one. Drag the file in, choose it, or take a photo on a phone.",
          "Paying someone for labor? If the payee has no W-9 on file, the form asks for one. It goes only to the finance office.",
          "If it's for an event, pick the event, so its spending shows on the event's page.",
          "Send it. The request page shows each step and what happens next.",
        ],
      },
      {
        heading: "Who approves it",
        steps: [
          "First your committee's chair or vice chair approves it. If you're the chair, your committee's director approves it instead.",
          "Then the finance office checks the receipts and accounts.",
          "Requests over IAR's limit also need an executive's approval.",
          "Then the finance office pays it and enters it in QuickBooks.",
          "Anyone waiting more than a few days gets a reminder, and it's escalated if it still waits.",
        ],
      },
      {
        heading: "Sent back",
        steps: [
          "Any step can send a request back with a note, such as a missing receipt.",
          "You'll get a message. Open the request, click Edit, fix it and send it again. Its approvals start again from the first step.",
        ],
      },
      {
        heading: "Credit card receipts",
        steps: [
          "Each month the finance office uploads IAR's card statement. If you hold an IAR card, you get a message when your charges are in.",
          "Open the link, or choose IAR credit card receipts and pick your card and the statement. Your charges are already filled in, with the date, store and amount from the statement.",
          "For each charge, choose its sub-account and say why it was bought. A card isn't tied to one committee: each charge can go to any committee's sub-account. The portal suggests the sub-account you used last time at the same store.",
          "Several charges from one store, such as Amazon, can be lumped together: one sub-account, one reason and one receipt (your order history for the month) cover them all. Click Split up to do them one by one.",
          "Attach a receipt or invoice for every charge. One file can cover several, such as your Amazon order history for the month. Receipts can't be left out.",
          "A request takes up to 10 files at a time. Have more? Send it with the first ones, then open the request and use Add more receipts as many times as you need, until it's done.",
          "Mark any charge that will be refunded or repaid.",
          "Card receipts go straight to the finance office.",
        ],
      },
      {
        heading: "Upload the card statement (finance office)",
        steps: [
          "On the finance desk, click Upload card statement and add the PDF from Truist.",
          "The portal reads every card's charges and checks they add up to the statement's totals. If anything doesn't add up, nothing is imported.",
          "Check the preview, then click Import and tell cardholders. Each cardholder gets a message to add their receipts.",
          "A card on the statement that isn't in Portal Settings is flagged. Add it there and upload the statement again.",
        ],
      },
    ],
  },
  {
    key: "marketing",
    title: "Marketing requests",
    summary: "Graphics, signs, announcements, highlights, webpages, short links and staff badges.",
    href: "/marketing",
    module: "marketing-requests",
    short: [
      "Marketing for an event? Put it on the event request instead: it asks marketing's questions there.",
      "For anything else, click New marketing request and pick what you need. Each kind asks only its own questions.",
      "The marketing team reviews new requests each week. They schedule it with a done-by date, ask you a question, or decline it.",
      "If they ask a question, answer it right on the request page.",
    ],
    sections: [
      {
        heading: "Ask for marketing",
        steps: [
          "Open Marketing Requests and click New marketing request.",
          "Pick what you need: graphic design, physical signage, an announcement, a highlight, a new webpage, a small website update, a short link, a staff badge, or something else.",
          "Answer the questions for that kind, and say when you need it. Share files as a Google Drive link.",
          "Send it. You'll see it under Your requests, with what happens next.",
        ],
      },
      {
        heading: "Marketing for an event",
        steps: [
          "Put marketing for an event on the event request itself. Tick Open to the public and answer marketing's questions there.",
          "Add images for the flyer (logos, photos, artwork) right on the form, or later on the request page. Image files only, no PDFs or Word documents.",
          "Marketing sees it as soon as the event is approved. Nothing is advertised before then.",
        ],
      },
      {
        heading: "What happens next",
        steps: [
          "The marketing team reviews new requests each week.",
          "They schedule it with a done-by date, ask you a question, or decline it with a reason.",
          "If they ask a question, you'll get a message. Answer it on the request page and it goes back to the team.",
          "When it's done, you'll get a message.",
        ],
      },
    ],
  },
  {
    key: "it-maintenance",
    title: "AV/IT/Maintenance",
    summary: "Report anything broken or needed in the building, IT or A/V, and follow it until it's fixed.",
    href: "/it-maintenance",
    module: "it-maintenance",
    short: [
      "Click AV/IT/Maintenance and choose the team: building and maintenance, or IT, A/V and tech.",
      "Say where it is, what's wrong and how urgent it is. A photo often saves the team a trip.",
      "The team picks it up and you can follow it here. When they mark it fixed, check it and confirm, or say it's not fixed.",
    ],
    sections: [
      {
        heading: "Report something",
        steps: [
          "Open IT & Maintenance and click AV/IT/Maintenance.",
          "Choose the team: building and maintenance, or IT, A/V and tech.",
          "Say what you need in a few words, then where it is and the details: what happened, when, and anything you already tried.",
          "Add a photo if you can. On a phone you can take one straight from the form.",
          "Choose how urgent it is, then send it.",
        ],
      },
      {
        heading: "Follow it",
        steps: [
          "Your requests are at the top of the page. The request page shows its steps and who has it.",
          "You'll get a message when someone picks it up, when it's waiting on parts, and when it's fixed.",
          "Want to hear about someone else's request? Open it and click Follow.",
        ],
      },
      {
        heading: "When it's fixed",
        steps: [
          "The team marks it fixed and says what they did.",
          "Check it, then click Confirm on the request page. If it isn't fixed, say what's still wrong and it goes back to the team.",
          "If you don't answer, it closes by itself after 7 days.",
        ],
      },
      {
        heading: "For the team",
        steps: [
          "The Team tab shows the board and quick filters: nobody has it, assigned to me, urgent and high, waiting on parts, late.",
          "Open a ticket and use the next step it shows: take it, start work, waiting on parts, or mark it fixed. Everything else is under More.",
          "Ready-made replies above the comment box save typing for the common answers.",
          "Preventive schedules create recurring tickets on their own.",
        ],
      },
    ],
  },
  {
    key: "requests",
    title: "My Requests",
    summary: "Everything you've asked for, and who it's waiting on.",
    href: "/requests",
    module: "my-requests",
    short: [
      "Everything you've asked for is here: events, payments, marketing and AV/IT/Maintenance.",
      "Needs you is at the top: something sent back, a question, or an event to close out.",
      "Waiting on others shows who has it now. Done is folded away at the bottom.",
    ],
    sections: [
      {
        heading: "Read the list",
        steps: [
          "Needs you lists requests waiting on you: sent back with a note, a question from marketing, an event to close out, or a fix to confirm.",
          "Waiting on others lists the rest, each with who has it now.",
          "Done is folded away at the bottom. Click it to open.",
          "The coloured edge says the same at a glance: gold for you, teal for others, green for done, red for stopped.",
          "Use the buttons above the list to show one kind of request.",
        ],
      },
      {
        heading: "Find something",
        steps: [
          "The search box at the top of every page finds a request by its number (like PO-12005) or by words in it.",
          "It only shows requests you're allowed to open.",
        ],
      },
    ],
  },
  {
    key: "away",
    title: "Out of office",
    summary: "Hand your approvals to someone while you're away.",
    href: "/away",
    short: [
      "Pick the first and last day you're away, and who covers your approvals.",
      "Approvals that wait on you by name go to them until your last day. They get a message when it starts.",
      "Finance and executive steps already go to everyone in that group, so they don't need covering.",
    ],
    sections: [
      {
        heading: "Before you go",
        steps: [
          "Open Out of office from the menu.",
          "Pick the first and last day you're away.",
          "Choose who covers for you, usually your vice chair, and add a short note if you like.",
          "Save it. The person covering gets a message.",
        ],
      },
      {
        heading: "While you're away",
        steps: [
          "Approvals that wait on you by name, such as your committee's chair approval, go to the person covering.",
          "Their approvals say they were covering for you, so the history stays clear.",
          "Finance and executive steps already go to everyone in that group, so they don't need covering.",
          "When your last day passes, everything comes back to you. You can also end it early.",
        ],
      },
    ],
  },
  {
    key: "teams",
    title: "Team Queues and the run sheet",
    summary: "For the marketing, A/V, security, facilities and office teams.",
    href: "/queues",
    module: "team-queues",
    short: [
      "Your team's tasks from every approved event are here, soonest due first.",
      "Tasks unlock when an event is approved. Open one to see the event's details, then start it and mark it done.",
      "The run sheet is one printable page of what's happening where each day.",
    ],
    sections: [
      {
        heading: "Team Queues",
        steps: [
          "Each team sees its own tasks across every approved event: the flyer and announcement for marketing, A/V setup for A/V, the room check for security.",
          "Tasks unlock when the event is approved. Locked ones are counted so you can plan ahead.",
          "Open a task to see everything the requester gave: the announcement text, the A/V needs, the room and times.",
          "Click Start when you begin and Done when you finish. The requester can see where each task stands.",
        ],
      },
      {
        heading: "The daily run sheet",
        steps: [
          "Open Daily Run Sheet (under IAR in the menu; everyone can see it) and pick the day and campus.",
          "It lists each room's bookings in time order, with the contact, the setup plan and security notes.",
          "Print it for the front desk or the security team.",
        ],
      },
    ],
  },
];

export const helpGuide = (key: string): HelpGuide | undefined => HELP_GUIDES.find((g) => g.key === key);

/** Where to go when the guides don't answer it. */
export const WHO_TO_ASK = [
  "Something unclear, missing or wrong? Click Send feedback in your account menu. It goes to the people building the portal, with the page you were on.",
  "A question about a request? Add a comment on its page. Everyone who can open the request sees it.",
  "A question about IAR's rules, such as room policy or spending limits, goes to the IAR office.",
];
