---
title: Gate-phase feedback check and auto-revisit
type: implementation
depends_on: [unit-01-feedback-helpers-and-tool]
quality_gates: [typecheck, test]
inputs:
  - knowledge/DATA-CONTRACTS.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - features/auto-revisit.feature
  - features/revisit-with-reasons.feature
---

# Gate-Phase Feedback Check and Auto-Revisit

Implement Group 5 from IMPLEMENTATION-MAP.md: the pending-feedback check at the top of the gate phase handler in `orchestrator.ts`, the `visits` counter increment, the `feedback_revisit` action, and the `haiku_revisit` extension with optional `reasons` parameter.

## Completion Criteria

- Gate phase handler (`orchestrator.ts:~1669`) checks `countPendingFeedback(slug, stage)` before any gate logic
- If pending > 0: increment `state.json.visits`, roll `phase` to `elaborate`, return `action: feedback_revisit` with pending count and summaries
- If pending == 0: proceed to existing gate logic unchanged
- `state.json.visits` defaults to 0 when field is absent (backward compat)
- `haiku_revisit` tool schema extended with optional `reasons: [{title, body}]` parameter
- With reasons: calls `writeFeedbackFile` once per reason (origin: agent, author: parent-agent) BEFORE rolling phase, atomic
- Without reasons: returns stopgap action telling agent to collect reasons, FSM does NOT roll back
- Empty reasons array: returns error, FSM does NOT roll back
- Reasons with empty title: returns error per reason validation
- `withInstructions` has a `feedback_revisit` case that includes the pending feedback list in the agent's context
- Tests cover: all 14 auto-revisit.feature scenarios + 17 revisit-with-reasons.feature scenarios
- `npx tsc --noEmit` passes
