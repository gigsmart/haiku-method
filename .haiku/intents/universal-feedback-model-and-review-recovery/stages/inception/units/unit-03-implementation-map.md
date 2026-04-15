---
title: Implementation map
type: research
depends_on:
  - unit-01-discovery-document
  - unit-02-design-decisions
quality_gates: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/DESIGN-DECISIONS.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-15T20:43:00Z'
hat_started_at: '2026-04-15T20:48:41Z'
outputs:
  - knowledge/IMPLEMENTATION-MAP.md
completed_at: '2026-04-15T20:49:17Z'
---

# Implementation Map

Produce an IMPLEMENTATION-MAP.md knowledge artifact that translates the discovery and design decisions into a concrete change manifest: which files change, what each change does, the dependency order between changes, and the test matrix.

## Completion Criteria

- IMPLEMENTATION-MAP.md exists at `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/IMPLEMENTATION-MAP.md`
- Lists every file that needs to change with a one-line description of the change
- Groups changes into logical work units that map to development-stage units:
  1. Feedback file schema + writeFeedbackFile helper (state-tools.ts)
  2. haiku_feedback MCP tool registration + handler (state-tools.ts, orchestrator.ts)
  3. haiku_feedback_update, haiku_feedback_delete, haiku_feedback_reject, haiku_feedback_list MCP tools (state-tools.ts)
  4. Rename existing haiku_feedback Sentry tool to haiku_report (server.ts, prompts/repair.ts)
  5. Gate-phase pending-feedback check + auto-revisit (orchestrator.ts)
  6. Review-UI changes_requested → feedback file writes (orchestrator.ts)
  7. Review subagent prompt update — parent-mediated feedback persistence (orchestrator.ts)
  8. Additive elaborate mode when visits > 0 (orchestrator.ts)
  9. Enforce-iteration fix — per-stage status instead of unit-file glob (hooks/enforce-iteration.ts, hooks/utils.ts)
  10. External PR/MR changes-requested detection + comment routing (orchestrator.ts, git-worktree.ts)
  11. Review server CRUD endpoints (http.ts)
  12. Review app UI — feedback display + CRUD integration (review-app/src/)
  13. Prototype visual updates (website/public/prototype-stage-flow.html)
- Each group identifies: files touched, estimated complexity (S/M/L), dependencies on other groups, test approach
- A test matrix listing what each group needs: unit tests, integration tests, manual verification
