---
title: >-
  prepareRevisitBranch leaves inconsistent state if fromStage merge conflicts
  after main merge succeeded
status: pending
origin: adversarial-review
author: fsm-code-review
author_type: agent
created_at: '2026-04-19T18:38:20Z'
iteration: 3
visit: 3
source_ref: null
closed_by: null
---

**Severity: MEDIUM — non-atomic merge sequence; partial state on conflict.**

`packages/haiku/src/git-worktree.ts:1146-1207`

Sequence:
1. Ensure target branch exists (line 1148).
2. Checkout target (1153).
3. Merge main → target (1164-1173). This can succeed cleanly.
4. Merge fromStage → target (1178-1194). This can conflict.

If step 3 succeeds but step 4 conflicts, the `catch` at 1201 runs `git merge --abort` — BUT this only aborts the in-progress merge (step 4). Step 3's merge is already committed on target. The function returns `{success: false, message: "..."}`, and the caller (`revisitEarlierStage`) returns an error.

**Result**: the target stage branch has intent-main merged in (irreversibly, absent manual reset), but NOT fromStage. The feedback files and artifacts from fromStage — the entire reason the commit c66c9ee0 was written — are still stranded on fromStage. The user is told "revisit failed," but the target branch has changed state they didn't agree to.

**Docstring claim vs reality**: the function docstring says "Non-destructive: never deletes branches. All commits on fromStage and targetStage are preserved." That's technically true — nothing is deleted — but the target branch's head pointer has been fast-forwarded/merged with main, changing its state. "Non-destructive" is misleading.

**Fix options**:
1. Save `git rev-parse HEAD` before step 3; on step 4 failure, `git reset --hard <saved>` to rewind target.
2. Do the merges in a temp worktree (`withTempWorktree` exists in the same file) and only fast-forward the real branch if both merges succeed.
3. Detect conflicts upfront via `git merge-tree` (dry-run) before doing the actual merge.

Option 2 is cleanest and mirrors the pattern used elsewhere in git-worktree.ts.

**Test gap**: this scenario has no test coverage (see separate finding on test coverage).
