# IAR Internal Tools Portal

One internal portal for the Islamic Association of Raleigh, signed into with an @islam1.org Google account. It replaces the Requisition Form (Google Forms + Form Approvals), the Program Request Form (Microsoft Forms) and the Marketing/AV Request Form with request cards that move through clear stages, owned by the requester and worked by each team from its own queue. Google Groups decide which modules each person sees.

Phase 1 modules: **My Requests**, **Purchase Requests** (payments, reimbursements, card receipts) and **Event cards** (room holds checked against IAR's Google Calendar, policy rules flagged automatically). Later: team queues, a daily run sheet, event close-out, gym rentals, Social & Welfare aid, and more.

**Status: planning / demo stage.** Nothing described here is built or in production.

## Start here

- **[docs/plan.md](docs/plan.md)** — the umbrella portal plan: problems, decisions, the event card lifecycle, modules, policy automation, architecture, roadmap, open questions. Live editable copy: [Claude doc](https://claude.ai/code/artifact/3c8494a5-1c2d-4c94-a234-fb35f36e1630).
- **[docs/purchase-requests-plan.md](docs/purchase-requests-plan.md)** — detailed design of the Purchase Requests module, including analysis of the PO response sheet. Live copy: [Claude doc](https://claude.ai/code/artifact/09936270-93b7-4009-942f-5ee4893ad89f). Its platform section is superseded by the portal plan's Architecture section.
- **[docs/letter.md](docs/letter.md)** — a short write-up for the office/Shura introducing Purchase Requests. Also a [Claude doc](https://claude.ai/code/artifact/58f2fcf1-9517-4166-9d92-ffd80ec23ddf).
- **[app/index.html](app/index.html)** — the clickable Purchase Requests prototype (sample data only, nothing saved). Live at https://claude.ai/artifact/RBKN5GrTWCqvFfDTqq5RzB.

## Picking this up in a new chat

Point Claude at this repo (`wizkashifa/iar`) and ask it to read `docs/plan.md`. The Claude docs linked above are the live, editable copies and may be ahead of what's exported here. Re-export with the Claude Docs `export` action (format `markdown`) after editing them, so this repo stays in sync.

## Ownership note

This system is meant to be owned by IAR as an organization, not by any one person's Google or Microsoft account. This repo is a stopgap under a personal GitHub account; move it to an IAR-owned GitHub org before going into production.
