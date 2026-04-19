---
title: >-
  haiku_run_next writes stage state BEFORE branch enforcement
  (external_review_url path)
status: pending
origin: adversarial-review
author: fsm-code-review
author_type: agent
created_at: '2026-04-19T18:36:40Z'
iteration: 3
visit: 3
source_ref: null
closed_by: null
---

**Severity: HIGH — state-mutating write on wrong branch, same class of bug 17f919de was supposed to fix.**

`packages/haiku/src/orchestrator.ts:5314-5332`

When `haiku_run_next` is called with `external_review_url`, the handler reads `intent.md`, finds the active stage, reads the stage state JSON, then `writeJson(ssPath, ssData)` — all BEFORE the new `ensureOnStageBranch` guard at line 5347.

```ts
if (args.external_review_url) {
    // ...
    const activeStage = (intentFm.active_stage as string) || ""
    if (activeStage) {
        const ssPath = stageStatePath(slug, activeStage)
        const ssData = readJson(ssPath)
        ssData.external_review_url = args.external_review_url as string
        writeJson(ssPath, ssData)   // <-- stage state write on wrong branch
    }
}
// ...
// THEN:
const guard = ensureOnStageBranch(slug, activeStage || undefined)
```

**Reproduction**: if main has drifted ahead of stage (exactly the scenario driving this change), this write lands on main. The stage branch is then fast-forwarded to main by `ensureOnStageBranch`'s merge logic — so the write SURVIVES, but:
1. It happened on the wrong branch first
2. The commit (if any via gitCommitState later) is attributed to a main-branch checkout
3. `readJson` may have read stale stage-state from main that didn't reflect stage-branch writes

**Fix**: move the `ensureOnStageBranch` guard ABOVE the external_review_url block. Also move the `readFrontmatter(intentFile)` that resolves `activeStage` to after the guard — or accept that `active_stage` from main is authoritative (it usually is, but that's a design contract not documented).
