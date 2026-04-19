---
title: ensureOnStageBranch does not handle dirty worktree — silent checkout failure
status: pending
origin: adversarial-review
author: fsm-code-review
author_type: agent
created_at: '2026-04-19T18:38:39Z'
iteration: 3
visit: 3
source_ref: null
closed_by: null
---

**Severity: MEDIUM — will fail in practice; user-facing error unhelpful.**

`packages/haiku/src/git-worktree.ts:722-811`

`ensureOnStageBranch` runs `git checkout targetBranch` (lines 767, 796) without first checking for uncommitted changes in the working tree. `git checkout` will fail ("error: Your local changes to the following files would be overwritten by checkout") if the switch would clobber tracked file modifications.

The function catches the error and returns `{ok: false, message: "failed to checkout ${targetBranch}: ..."}`. The caller (enforceStageBranch wrapper) surfaces this as an MCP error: "Error: stage-branch enforcement failed for intent 'X', stage 'Y' — failed to checkout haiku/X/Y: ..."

**Reproduction**: I observed this worktree RIGHT NOW has `M .claude/settings.json` and `D .claude/scheduled_tasks.lock` in the working tree. If the FSM tried to switch branches, it could fail depending on whether those paths differ between branches. Hooks writing to `.claude/` during a stage are a real source of dirty worktree.

**Additional edge cases not handled**:
- Merge in progress (`.git/MERGE_HEAD` exists) — any merge/checkout will fail with "You have not concluded your merge".
- Rebase in progress (`.git/rebase-apply/` or `.git/rebase-merge/`) — same problem.
- Detached HEAD — `getCurrentBranch()` returns "HEAD" which never matches `targetBranch`, so we always try to checkout; that's actually correct, just noisy.
- Worktree locked — `git checkout` should still work but the checkout may compete with another process.
- Stage branch exists remotely but not locally — `branchExists` only checks local refs (need to verify). If remote-only, we fall back to intent-main even though stage-branch exists on origin.

**Fix**:
1. Before `git checkout`, check `git status --porcelain` for dirty state. If dirty, either `git stash` and re-apply, or refuse with a clearer error ("Worktree has uncommitted changes; commit or stash before branch enforcement runs").
2. Check for `.git/MERGE_HEAD` / `.git/rebase-*` and refuse early with a specific message.
3. Optionally `git fetch origin` before `branchExists` to account for remote-only branches, or explicitly check `git rev-parse refs/remotes/origin/{branch}`.
