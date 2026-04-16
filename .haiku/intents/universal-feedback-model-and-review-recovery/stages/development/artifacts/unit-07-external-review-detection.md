# External Review Detection Implementation

## Changes

### `packages/haiku/src/orchestrator.ts`

- Replaced `checkExternalApproval(url): boolean` with `checkExternalState(url): ExternalReviewState`
- `ExternalReviewState` returns `{status, provider?, url?}` with status: `approved | changes_requested | pending | unknown`
- GitHub: parses `reviewDecision` for `CHANGES_REQUESTED` in addition to `APPROVED`
- GitLab: detects `approved === false` on open MRs as changes-requested
- Added 15-second timeout to CLI calls for graceful timeout handling
- Gate-phase handler: detects `changes_requested` on blocked stages, creates feedback file via `writeFeedbackFile`, rolls FSM to elaborate, increments visits
- Completed-blocked handler: same logic as defensive fallback
- Returns `action: "external_changes_requested"` with feedback_id, file path, visit count, and provider info

### `packages/haiku/test/external-review.test.mjs`

- 22 tests covering:
  - `checkExternalState` for GitHub PR (approved, merged, changes_requested, pending, empty)
  - `checkExternalState` for GitLab MR (approved, merged, non-approved open, closed)
  - Error handling (CLI missing, invalid JSON, non-zero exit, unknown URL)
  - Orchestrator integration (changes_requested, approved, pending, unknown, no URL, GitLab, multi-round, COMMENTED)
