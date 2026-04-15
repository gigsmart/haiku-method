---
title: Design decisions document
type: research
depends_on:
  - unit-01-discovery-document
quality_gates: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-15T20:39:17Z'
hat_started_at: '2026-04-15T20:41:33Z'
outputs:
  - knowledge/DESIGN-DECISIONS.md
completed_at: '2026-04-15T20:42:11Z'
---

# Design Decisions Document

Produce a DESIGN-DECISIONS.md knowledge artifact that captures the key architectural choices, the alternatives considered, and the rationale for each decision. This artifact ensures downstream stages have a clear design mandate, not just a problem description.

## Completion Criteria

- DESIGN-DECISIONS.md exists at `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-DECISIONS.md`
- Documents the "universal feedback currency" model and why it was chosen over per-source handling
- Documents the direct subagent feedback persistence path (subagents inherit MCP tools from parent and call haiku_feedback directly) and why parent-mediated was rejected (unnecessary indirection — subagents have full MCP access)
- Documents the auto-revisit-on-pending-feedback invariant and why an explicit agent-approval tool was rejected
- Documents the additive elaborate mode (visits > 0) and the closes: [FB-NN] contract
- Documents the `haiku_feedback` name collision with the Sentry bug-report tool and the resolution (rename existing to `haiku_report`)
- Documents the gate-phase check placement (gate handler, not review handler, because FSM advances to gate before review agents run)
- Each decision has: choice, alternatives considered, rationale, and tradeoffs
