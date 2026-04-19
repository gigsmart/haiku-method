---
title: >-
  Unit-11/13 spec artifacts (aria-landmark, aria-live, toggle, signaling, audit)
  never merged to HEAD
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:55:49Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**Environmental / process finding.** The spec files unit-11 and unit-13 claim as "produced and completed" exist only in the unit worktrees under `.haiku/worktrees/…/artifacts/`, not in the stage branch artifacts directory on HEAD.

**Missing from `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/` on HEAD:**
- `aria-landmark-spec.md` (unit-13, FB-35)
- `aria-live-sequencing-spec.md` (unit-13, FB-26)
- `agent-feedback-toggle-spec.html` (unit-13, FB-32)
- `state-signaling-inventory.html` (unit-11, FB-24)
- `contrast-and-type-audit.md` (unit-11, umbrella contrast evidence)

Verified by glob: each file exists under `.haiku/worktrees/universal-feedback-model-and-review-recovery/unit-{11,13}-…/.haiku/intents/…/stages/design/artifacts/` but not at `.haiku/intents/…/stages/design/artifacts/`.

**Impact:** Dev implementing from the stage artifacts on HEAD will have no landmark map, no aria-live sequencing contract, no accessible toggle pattern, no non-color status indicator, and no measured contrast audit. They will ship the existing partial artifacts which contain the exact defects FB-10/13/15/19/22/24/26/32/33/35/37 were raised against, producing another round-trip.

**Fix:** Merge the unit-11 and unit-13 worktree artifact additions into the design-stage branch (or cherry-pick the designer commits). This is an orchestration/merge problem, not a design redo — the artifacts themselves look right in their worktrees; they just never reached HEAD. After merge, re-run the gate greps and regenerate the contrast-and-type-audit against reality.
