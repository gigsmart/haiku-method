---
title: recreateStageBranchFromMain is dead code — retained but confusing
status: pending
origin: adversarial-review
author: fsm-code-review
author_type: agent
created_at: '2026-04-19T18:39:17Z'
iteration: 3
visit: 3
source_ref: null
closed_by: null
---

**Severity: LOW — code hygiene; misleading.**

`packages/haiku/src/git-worktree.ts:1047-1111` (approx; the location where it was before)

`recreateStageBranchFromMain` was the old destructive revisit helper. Commit c66c9ee0 removed the sole FSM callers (revisitCurrentStage and revisitEarlierStage in orchestrator.ts) and replaced them with `prepareRevisitBranch`. The commit message acknowledges: "recreateStageBranchFromMain is kept in git-worktree.ts for backwards compatibility but no longer called by the FSM."

**Problem**: "backwards compatibility" is ambiguous. This is an internal export — not a public API with external consumers. Grep confirms no callers remain:

```
Grep "recreateStageBranchFromMain" → only defs, no invocations after c66c9ee0
```

Keeping dead code:
1. Confuses future readers — "why does this destructive helper exist if prepareRevisitBranch is the non-destructive replacement?"
2. Risks being accidentally re-wired by a future author who doesn't know the history.
3. Bloats the module.

**Fix**: delete `recreateStageBranchFromMain`. If there's genuine external usage, point at the specific caller. If not, just remove it — `git log` preserves the history if someone ever needs it back.

If keeping is required, add a big `@deprecated Use prepareRevisitBranch. Scheduled for removal in vX.Y.` JSDoc comment at minimum.
