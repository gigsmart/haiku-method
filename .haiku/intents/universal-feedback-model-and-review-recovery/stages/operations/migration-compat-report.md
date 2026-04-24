# Migration Compatibility Report

**Intent:** universal-feedback-model-and-review-recovery
**Date:** 2026-04-16
**Test file:** `packages/haiku/test/migration-compat.test.mjs`

## Summary

All backward compatibility checks pass. The universal feedback model introduces no breaking changes for existing intents. Every new feature uses absent-field defaults, so legacy intents work without migration scripts.

## Checks Performed

### (a) No feedback/ directory

**Status:** PASS

Existing completed intents (e.g., `haiku-rebrand`) have no `feedback/` directory in any stage. Verified:

- `countPendingFeedback(slug, stage)` returns `0` (not an error) when no feedback directory exists
- `readFeedbackFiles(slug, stage)` returns `[]` for nonexistent feedback directories
- `readFeedbackFiles` also returns `[]` for completely nonexistent stages

The guard is in `readFeedbackFiles` at `state-tools.ts:2122-2123`:
```
if (!existsSync(dir)) return []
```

### (b) No visits field in state.json

**Status:** PASS

Existing stage `state.json` files have no `visits` field. Verified:

- The orchestrator elaborate handler uses `(stageState.visits as number) || 0` at line 1446, treating missing field as `visits: 0`
- When `visits === 0`, the additive elaborate code path is skipped entirely
- The gate-phase feedback check uses the same pattern at line 1974: `((gateState.visits as number) || 0) + 1`
- The revisit handler at line 5148 also defaults: `(revisitState.visits as number) || 0`

### (c) No closes: field in units

**Status:** PASS

All existing units lack the `closes:` field. Verified:

- The `closes:` validation only activates inside the `if (visits > 0)` block (orchestrator line 1447)
- When `visits === 0`, the elaborate handler falls through to normal validation, which does not check for `closes:`
- Units created during the initial elaboration (visit 0) never need `closes:` — it is only required for additive elaborate cycles

### (d) enforce-iteration hook with legacy intents

**Status:** PASS

One existing intent (`cowork-mcp-apps-integration`) has no `stages:` field in its frontmatter. Verified:

- `readFrontmatterStringList` returns `[]` when the field is missing — no crash
- `allStagesCompleted` returns `false` when `stages` is empty — graceful fallback
- The enforce-iteration hook reads `active_stage` and gracefully exits when no stage is active (line 55: `if (!activeStage) return`)

### (e) haiku_feedback_list on stages with no feedback directory

**Status:** PASS

The `haiku_feedback_list` MCP tool handler:

- Returns `{ count: 0, items: [] }` for stages with no `feedback/` directory
- Returns `{ count: 0, items: [] }` across all stages when none have feedback
- Returns `{ count: 0, items: [] }` for intents with no `stages/` directory at all

The guard path: `haiku_feedback_list` handler -> `readFeedbackFiles()` -> `!existsSync(dir) ? return []` -> 0 items collected.

### (f) checkExternalState return shape

**Status:** PASS

The function was changed from returning a boolean to returning an `ExternalReviewState` object:

```typescript
interface ExternalReviewState {
  status: "approved" | "changes_requested" | "pending" | "unknown"
  provider?: "github" | "gitlab"
  url?: string
}
```

All callers in the orchestrator use `externalState.status === "approved"` (not truthiness checks). Verified:

- GitHub PR approved: `{ status: "approved", provider: "github", url: "..." }`
- GitHub PR changes_requested: `{ status: "changes_requested", provider: "github", url: "..." }`
- GitHub PR pending: `{ status: "pending", provider: "github", url: "..." }`
- CLI error/unknown URL: `{ status: "unknown" }`
- Callers at orchestrator lines 2026-2027 and 2164-2165 compare `.status` not the object itself

## Existing Intent Audit

Examined all 21 intents on disk:

| Intent | stages: field | feedback/ dirs | visits in state | Status |
|--------|:---:|:---:|:---:|--------|
| haiku-rebrand | yes | none | none | completed, compatible |
| operations-phase | yes | none | none | completed, compatible |
| quick-mode-workflows | yes | none | none | completed, compatible |
| visual-review | yes | none | none | completed, compatible |
| cowork-mcp-apps-integration | **missing** | none | none | active, compatible (graceful fallback) |
| universal-feedback-model-and-review-recovery | yes | none | none | active, compatible |
| (15 others) | yes | none | none | completed, compatible |

## Test Coverage

21 new tests in `packages/haiku/test/migration-compat.test.mjs`:

- 3 tests for absent feedback directory handling
- 2 tests for missing visits field defaults
- 2 tests for absent closes: field behavior
- 3 tests for legacy intents without stages: field
- 3 tests for haiku_feedback_list on empty/missing stages
- 5 tests for checkExternalState return shape
- 3 integration tests for legacy intent orchestrator roundtrips

Full suite: **439 tests pass, 0 failures** across 13 test files.

## Conclusion

No migration scripts needed. The feedback model uses defensive defaults at every boundary:

- Missing directory -> empty array
- Missing field -> zero/false/empty
- Missing frontmatter key -> graceful fallback

Existing intents continue to work without modification.
