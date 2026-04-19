---
title: >-
  handleExternalChangesRequested and writeReviewFeedbackFiles lack branch
  enforcement
status: pending
origin: adversarial-review
author: fsm-code-review
author_type: agent
created_at: '2026-04-19T18:37:30Z'
iteration: 3
visit: 3
source_ref: null
closed_by: null
---

**Severity: HIGH — silent write to wrong branch on both external-review and ask-gate paths.**

`packages/haiku/src/orchestrator.ts:581-642` (`handleExternalChangesRequested`) and `723-794` (`writeReviewFeedbackFiles`)

Both helpers call `writeFeedbackFile` + `gitCommitState` without any `ensureOnStageBranch` call.

`handleExternalChangesRequested` at line 588:
```ts
const fbResult = writeFeedbackFile(slug, currentStage, { ... })
gitCommitState(`feedback: create ${fbResult.feedback_id} from external review in ${currentStage}`)
// Then writes stage state:
writeJson(statePath, stateData)
```

`writeReviewFeedbackFiles` at lines 747, 766, 781 writes multiple feedback files from review UI annotations (pins, comments, free-form) and commits at 791.

Both are called from `runNext`/`handleReviewResult` paths. `haiku_run_next` now has an `ensureOnStageBranch` guard at the top of the MCP handler — so IN THEORY these helpers run after enforcement... BUT:

1. The guard runs only if the intent file exists (OK, it does).
2. The guard reads `active_stage` from intent.md on whatever branch we're on. If main is drifted and has a stale `active_stage`, the guard enforces the wrong stage branch.
3. After the guard, `runNext` can internally call `fsmStartStage` which does its own checkout via `createStageBranch`/`mergeStageBranchForward`. By the time `handleExternalChangesRequested` or `writeReviewFeedbackFiles` fires later in the same tool call, the checkout may have moved again — and there's no re-enforcement.

**Fix**: add `ensureOnStageBranch(slug, currentStage)` at the top of `handleExternalChangesRequested` and `writeReviewFeedbackFiles` for defense-in-depth. These are internal helpers but they write persistent state.

**Also**: `handleExternalChangesRequested` writes stage-state JSON (line 605) *after* writing feedback and committing. If the branch was wrong at step 1 and correct at step 2, the feedback commit is orphaned on the wrong branch.
