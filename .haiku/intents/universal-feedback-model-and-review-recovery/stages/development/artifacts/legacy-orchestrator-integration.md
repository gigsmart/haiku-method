# Unit 05: Orchestrator Integration — Implementation Notes

## Files Modified

### `packages/haiku/src/orchestrator.ts`
- Added `writeReviewFeedbackFiles()` helper (Group 6) — extracts pins, comments, and free-text from review-UI changes_requested results into individual feedback files
- Updated all 3 `changes_requested` handler paths to call the helper before returning
- Updated `review` case in `buildRunInstructions` (Group 7) — subagent templates now instruct `haiku_feedback` calls instead of text-only findings
- Updated `review_elaboration` case similarly
- Parent instructions simplified: no more "up to 3 cycles" soft-loop
- Added `additive_elaborate` detection in elaborate phase handler (Group 8) — when `visits > 0`, returns specialized action with completed units list, pending feedback, and `closes:` validation
- Added `additive_elaborate` case in `enrichActionWithPreview` and `buildRunInstructions`

### `packages/haiku/src/state-tools.ts`
- Added feedback closure logic in `haiku_unit_advance_hat` handler — when a unit with `closes: [FB-NN]` completes, each referenced feedback item is updated to `addressed` status

### `packages/haiku/test/orchestrator-integration.test.mjs` (new)
- 15 tests covering all 3 groups
- Group 6: annotations write individual files, free-text only, empty submission, intent_review context
- Group 7: subagent prompt contains haiku_feedback instructions, old patterns removed
- Group 8: additive_elaborate action, normal elaborate at visits=0, missing closes validation, invalid refs, orphaned feedback, valid closes pass-through, instructions content, feedback update mechanism, closes parsing

## Test Results
- All 392 tests pass across 11 test files
- `npx tsc --noEmit` passes cleanly
