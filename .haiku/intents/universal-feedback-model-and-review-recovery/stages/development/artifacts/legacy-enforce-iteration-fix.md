# Unit 06: Enforce-Iteration Auto-Completion Fix

## Problem

The `enforce-iteration.ts` stop hook used unit-file globbing to determine intent completion. When only one stage (e.g., inception) had been elaborated with completed units, the hook would see N completed / N total and incorrectly flip `allComplete = true`, even though later stages (design, development, security) had not been elaborated yet.

## Solution

Replaced the unit-file-based completion check with `allStagesCompleted()`, which reads the `stages:` list from `intent.md` frontmatter and verifies every declared stage has `state.json` with `status === "completed"`.

## Files Changed

- `packages/haiku/src/hooks/utils.ts` -- Added `readFrontmatterStringList()` and `allStagesCompleted()`
- `packages/haiku/src/hooks/enforce-iteration.ts` -- Replaced unit-file glob with `allStagesCompleted()` call
- `packages/haiku/test/enforce-iteration.test.mjs` -- 14 tests covering both new utility functions and the regression scenario
