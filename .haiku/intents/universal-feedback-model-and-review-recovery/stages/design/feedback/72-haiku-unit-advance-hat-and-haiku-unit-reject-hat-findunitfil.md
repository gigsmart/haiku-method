---
title: >-
  haiku_unit_advance_hat and haiku_unit_reject_hat: findUnitFile reads before
  enforcement
status: pending
origin: adversarial-review
author: fsm-code-review
author_type: agent
created_at: '2026-04-19T18:38:03Z'
iteration: 3
visit: 3
source_ref: null
closed_by: null
---

**Severity: MEDIUM — same class as b129278b fixed for reject_feedback, but only partially applied.**

`packages/haiku/src/state-tools.ts:3921-3936` (`haiku_unit_advance_hat`) and `4477-4495` (`haiku_unit_reject_hat`).

Both handlers call `findUnitFile(intent, unit)` BEFORE calling `enforceStageBranch(intent, advStage)`:

```ts
// haiku_unit_advance_hat
const unitInfo = findUnitFile(args.intent as string, args.unit as string)
if (!unitInfo) return text(...)
const advPath = unitInfo.path
const advStage = unitInfo.stage
const advBranchErr = enforceStageBranch(args.intent as string, advStage)  // too late
```

`findUnitFile` (state-tools.ts:2658) does:
1. `resolveActiveStage(intent)` — reads intent.md frontmatter.
2. `existsSync(unitPath(intent, activeStage, unit))` — filesystem check.
3. Fallback: `readdirSync(stagesDir)` and stat each stage's unit file.

All of these read from the CURRENT branch checkout. If main has drifted:
- `active_stage` on main may differ from the stage branch's truth. A unit marked "completed" on main but still "active" on stage will be found in the wrong stage.
- Fallback scans all stage dirs — but again on main, not stage.
- `unitInfo.stage` is then passed to `enforceStageBranch` — we enforce the WRONG branch, possibly merging main → wrong-stage or failing.

This is exactly the bug b129278b fixed for `haiku_feedback_reject` (moved enforce above `findFeedbackFile`), but the unit handlers weren't similarly fixed.

**Fix**: for `haiku_unit_advance_hat` and `haiku_unit_reject_hat`, we need to enforce branch first. But we don't know the stage yet — `findUnitFile` tells us. Options:
1. Require `stage` as a tool argument (breaking change).
2. Enforce main first (`ensureOnStageBranch(intent, undefined)` → intent main), then findUnitFile, then enforce stage branch.
3. Add `active_stage`-based pre-enforcement: call `resolveActiveStage`, enforce that, then findUnitFile.

Option 3 is probably best and matches how `haiku_unit_start` already works (line 3848).
