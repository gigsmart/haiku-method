---
title: haiku_revisit writes feedback files and commits without enforceStageBranch
status: pending
origin: adversarial-review
author: fsm-code-review
author_type: agent
created_at: '2026-04-19T18:36:58Z'
iteration: 3
visit: 3
source_ref: null
closed_by: null
---

**Severity: HIGH — exact class of bug 17f919de claims to fix, but slipped through.**

`packages/haiku/src/orchestrator.ts:6287-6450`

The `haiku_revisit` orchestrator handler writes feedback files at 6391 via `writeFeedbackFile(revisitSlug, revisitTargetStage, ...)` and commits at 6402 with `gitCommitState(...)`. There is NO `ensureOnStageBranch` call anywhere in this handler.

```ts
for (const reason of reasons) {
    const fb = writeFeedbackFile(revisitSlug, revisitTargetStage, { ... })
    createdFeedback.push({ feedback_id: fb.feedback_id, title: reason.title })
}
gitCommitState(`haiku: revisit feedback in ${revisitTargetStage} ...`)
```

**Reproduction**: user calls `haiku_revisit` with reasons while the MCP checkout is on intent-main (drift scenario). The feedback files are written into the filesystem and committed on main, not the target stage branch. This is the exact problem 17f919de was meant to prevent for the agent-facing `haiku_feedback` tool, but the user-facing revisit path still writes on main.

**Worse**: `revisit()` later calls `revisitEarlierStage` or `revisitCurrentStage` which calls `prepareRevisitBranch(...)` — which runs `git checkout targetBranch`. If the just-created feedback file is an uncommitted change on main (unlikely since gitCommitState ran, but possible if gitCommitState silently failed), the checkout would strand it. Even with the commit landing cleanly, it lands on the WRONG branch — main now has feedback files that should have been on the stage branch.

**Fix**: add `enforceStageBranch(revisitSlug, revisitTargetStage)` (or the `ensureOnStageBranch` equivalent) immediately after resolving `revisitTargetStage` at line 6383, BEFORE the `writeFeedbackFile` loop.

Also: `nextFeedbackNumber(dir)` counts existing NN-prefixed files in the stage's feedback dir. If the directory contents on main differ from the stage branch (drift scenario), the NN allocation will collide once the branches re-align — two feedback files with the same FB-NN ID.
