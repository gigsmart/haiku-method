---
title: >-
  haiku_feedback auto-creates stage dir and reads intent.md BEFORE branch
  enforcement
status: pending
origin: adversarial-review
author: fsm-code-review
author_type: agent
created_at: '2026-04-19T18:37:45Z'
iteration: 3
visit: 3
source_ref: null
closed_by: null
---

**Severity: MEDIUM — read-before-enforce ordering bug with filesystem side effects.**

`packages/haiku/src/state-tools.ts:5549-5595`

The `haiku_feedback` (create) handler has this sequence:

1. Line 5550-5557: reads `intent.md` with `existsSync` → auto-reads via `readFileSync` at 5577 to validate stage membership.
2. Line 5573-5592: `existsSync(stgDir)` check and potentially `mkdirSync(stgDir, ...)` — filesystem mutation.
3. Line 5594: `enforceStageBranch(intent, stage)` finally runs.
4. Line 5597: `writeFeedbackFile(...)`.

**Bug**: steps 1 and 2 run on whatever branch the checkout is currently on. If main has drifted and the stage dir exists on the stage branch but not on main, we incorrectly enter the auto-create path. We read `intentData.stages` from main (potentially stale) to validate the stage, and `mkdirSync` creates the directory on main. Then enforce runs, merging main → stage, which now propagates the unnecessary mkdir onto stage (harmless but noise).

**Worse**: if the `stages:` list in `intent.md` on main differs from the list on the stage branch (very possible if studio was changed via a revisit), the stage validation could wrongly reject a legitimate feedback create, OR wrongly accept an invalid one.

**Fix**: move `enforceStageBranch(intent, stage)` to IMMEDIATELY after argument validation (after line 5547), BEFORE the intent.md read. All reads and filesystem mutations must happen on the correct branch.

Same pattern likely exists in other state-tools handlers that read FS before enforcing.
