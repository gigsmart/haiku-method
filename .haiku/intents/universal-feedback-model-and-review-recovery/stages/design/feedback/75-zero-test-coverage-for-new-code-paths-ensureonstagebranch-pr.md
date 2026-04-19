---
title: >-
  Zero test coverage for new code paths — ensureOnStageBranch,
  prepareRevisitBranch, enforceStageBranch
status: pending
origin: adversarial-review
author: fsm-code-review
author_type: agent
created_at: '2026-04-19T18:39:03Z'
iteration: 3
visit: 3
source_ref: null
closed_by: null
---

**Severity: MEDIUM — entirely untested, despite commit messages claiming "tests green".**

Grep of `packages/haiku/test/*.mjs`:
```
ensureOnStageBranch|prepareRevisitBranch|enforceStageBranch
```
→ zero matches.

The three commits (17f919de, c66c9ee0, b129278b) add:
- `ensureOnStageBranch` in git-worktree.ts (~90 lines)
- `prepareRevisitBranch` in git-worktree.ts (~95 lines)
- `enforceStageBranch` helper in state-tools.ts (~30 lines)
- Wire-ups to 10+ MCP tool handlers

**None of this has a dedicated test.** The commit messages say "Tests green: orchestrator (56), feedback (67), state-tools-handlers (68)." but those are the pre-existing suites that happen to still pass because the new code is either a pure no-op in the test environment (filesystem mode, `isGitRepo()` returns false) or because the tests don't exercise the drift scenario.

**Missing test cases**:
1. `ensureOnStageBranch` recovery path: simulate drift (main has commits ahead of stage), call a guarded tool, assert main → stage merge happened and the current checkout is on stage.
2. `ensureOnStageBranch` with dirty worktree — should fail cleanly.
3. `ensureOnStageBranch` when stage branch exists remotely only.
4. `prepareRevisitBranch` clean case: both main and fromStage have commits, merged cleanly.
5. `prepareRevisitBranch` conflict on main → target: asserts abort and clean rollback.
6. `prepareRevisitBranch` conflict on fromStage → target AFTER main succeeded: asserts rollback of main merge too (or that the caller sees atomic failure).
7. `prepareRevisitBranch` with `fromStage === targetStage` (self-merge guard).
8. `prepareRevisitBranch` with `fromStage === ""` (empty string guard).
9. `enforceStageBranch` ordering: verify all 10+ guarded handlers enforce BEFORE any filesystem read/write. An integration test could spawn a git repo, simulate drift, invoke each tool, assert correctness.

**Risk**: without tests, the next refactor will silently regress this. The intent that prompted these commits was itself a regression of prior work — this is a cycle.

**Fix**: add tests before declaring this work done. At minimum the happy-path drift-recovery test.
