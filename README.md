# IAR Purchase Requests

A replacement for IAR's "Requisition Form" (Google Forms + Form Approvals) — one system to request payments, get reimbursed, and submit credit card receipts, with a dashboard that tracks every request from submission to QuickBooks entry.

**Status: planning / demo stage.** Nothing described here is built or in production. This repo holds the plan, the analysis behind it, and a clickable prototype — for the Shura and finance office to review before anything is built.

## Start here

- **[docs/plan.md](docs/plan.md)** — the living plan: problems with the current form and their root causes, what the 2026 response-sheet data shows, platform options considered, the proposed design (workflow, data model, files/retention, ownership/access), credit card receipts, the MVP, rollout, an internal-controls review, and open questions for the office. The up-to-date version of this also lives as a [Claude doc](https://claude.ai/code/artifact/09936270-93b7-4009-942f-5ee4893ad89f) that can keep being edited there — `docs/plan.md` is a snapshot exported from it.
- **[docs/letter.md](docs/letter.md)** — a short write-up for the office/Shura introducing the new system and why it's needed. Also a [Claude doc](https://claude.ai/code/artifact/58f2fcf1-9517-4166-9d92-ffd80ec23ddf).
- **[app/index.html](app/index.html)** — the clickable prototype (sample data only, nothing saved). Open it directly in a browser, or see it live at https://claude.ai/artifact/RBKN5GrTWCqvFfDTqq5RzB.

## Picking this up in a new chat

Point Claude at this repo (`wizkashifa/iar`) and ask it to read `docs/plan.md` for context, or just ask it to open the Claude docs linked above — they're the live, editable copies and may be ahead of what's exported here. Re-export with the Claude Docs `export` action (format `markdown`) after editing the live docs, so this repo stays in sync.

## Ownership note

This system is meant to be owned by IAR as an organization, not by any one person's Google or Microsoft account — that's the whole point (see "Ownership and access" in the plan). This repo is a stopgap under a personal GitHub account; move it to an IAR-owned GitHub org before going into production, consistent with everything else in the design.
