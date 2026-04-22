# Unit 04: Gate-Phase Feedback Check and Auto-Revisit

## Summary

Implemented structural enforcement of pending feedback at the gate phase and extended `haiku_revisit` with an optional `reasons` parameter for durable feedback capture before rollback.

## Gate-Phase Feedback Check

At the top of the `phase === "gate"` handler in `orchestrator.ts`:
- Calls `countPendingFeedback(slug, currentStage)` before any gate logic
- If pending > 0: increments `state.json.visits`, sets phase to `elaborate`, returns `feedback_revisit` action with pending count and item summaries
- If pending == 0: falls through to existing gate logic unchanged
- Fires before auto, ask, external, and compound gate types (no bypass possible)

## `feedback_revisit` Action in `buildRunInstructions`

- Renders pending items as a bulleted list (FB-NN, title, origin, author)
- Instructs agent to perform additive elaboration with `closes:` frontmatter on new units
- Tells agent NOT to modify completed units from prior visits

## `haiku_revisit` Extension

- Extended `inputSchema` with optional `reasons: [{title, body}]`
- With reasons: validates each, calls `writeFeedbackFile` per reason (origin: agent, author: parent-agent), performs rollback, increments visits
- Without reasons: returns `revisit_needs_reasons` stopgap (no FSM change)
- Empty array: validation error
- Empty title/body: validation error

## Files Changed

- `packages/haiku/src/orchestrator.ts` -- Gate feedback check, feedback_revisit action case, haiku_revisit reasons extension, external review state detection
- `packages/haiku/test/gate-feedback.test.mjs` -- 26 tests covering gate check and revisit extension
- `packages/haiku/test/external-review.test.mjs` -- Fixed 7 pre-existing test failures (missing prior stage setup)

## Verification

- `npx tsc --noEmit` passes clean
- `npm test` passes: 377 tests across 10 files, 0 failures
